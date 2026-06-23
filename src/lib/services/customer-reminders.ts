import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { queueCustomerReminderEmail } from '@/lib/notifications/customer-reminder-email';
import type {
  CreateCustomerReminderInput,
  CustomerReminder,
  CustomerReminderRow,
  CustomerReminderStatus,
} from '@/lib/customer-reminders/types';
import { mapReminderRow } from '@/lib/customer-reminders/types';

async function resolveCustomerUuid(customerExternalId: string): Promise<{ uuid: string; company: string }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('customers')
    .select('id, company')
    .eq('external_id', customerExternalId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error('Customer not found');
  return { uuid: data.id, company: data.company };
}

async function resolvePortalUserId(email: string): Promise<string | null> {
  const trimmed = email.trim();
  if (!trimmed) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from('profiles').select('id').ilike('email', trimmed).maybeSingle();
  return data?.id ?? null;
}

function portalNotificationCopy(
  kind: CreateCustomerReminderInput['kind'],
  title: string,
  body?: string,
): { title: string; body: string } {
  const prefix =
    kind === 'calendar' ? 'Calendar event' : kind === 'reminder' ? 'Reminder' : 'Task';
  return {
    title: `${prefix}: ${title}`,
    body: body?.trim() || `Your Candid team added a ${kind} to your account. Open Alerts & Actions for details.`,
  };
}

async function deliverCustomerNotifications(
  reminder: CustomerReminderRow,
  customerCompany: string,
  customerExternalId: string,
): Promise<Partial<CustomerReminderRow>> {
  const updates: Partial<CustomerReminderRow> = {};
  const admin = createSupabaseAdminClient();

  if (reminder.notify_portal && reminder.contact_email && !reminder.portal_notified_at) {
    const userId = await resolvePortalUserId(reminder.contact_email);
    if (userId) {
      const copy = portalNotificationCopy(reminder.kind, reminder.title, reminder.body ?? undefined);
      const { error } = await admin.from('member_notifications').insert({
        user_id: userId,
        type: 'customer_reminder',
        title: copy.title,
        body: copy.body,
        reminder_id: reminder.id,
      });
      if (!error) {
        updates.portal_notified_at = new Date().toISOString();
      }
    }
  }

  if (reminder.notify_email && reminder.contact_email && !reminder.email_sent_at) {
    const whenLabel =
      reminder.kind === 'calendar'
        ? reminder.calendar_start_at ?? undefined
        : reminder.due_at ?? undefined;
    await queueCustomerReminderEmail({
      email: reminder.contact_email,
      customerName: customerCompany,
      title: reminder.title,
      body: reminder.body ?? undefined,
      kind: reminder.kind,
      whenLabel,
    });
    updates.email_sent_at = new Date().toISOString();
  }

  if (Object.keys(updates).length) {
    await admin.from('customer_reminders').update(updates).eq('id', reminder.id);
    return { ...reminder, ...updates };
  }

  return reminder;
}

export async function listCustomerReminders(customerExternalId: string): Promise<CustomerReminder[]> {
  const { uuid } = await resolveCustomerUuid(customerExternalId);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('customer_reminders')
    .select('*')
    .eq('customer_id', uuid)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    if (error.message.includes('customer_reminders')) return [];
    throw new Error(error.message);
  }

  return ((data as CustomerReminderRow[]) ?? []).map((row) => mapReminderRow(row, customerExternalId));
}

export async function createCustomerReminder(
  input: CreateCustomerReminderInput,
  createdBy?: string | null,
): Promise<CustomerReminder> {
  const { uuid, company } = await resolveCustomerUuid(input.customerExternalId);
  const admin = createSupabaseAdminClient();

  const row = {
    customer_id: uuid,
    deal_external_id: input.dealExternalId?.trim() || null,
    kind: input.kind,
    title: input.title.trim(),
    body: input.body?.trim() || null,
    due_at: input.kind === 'calendar' ? null : input.dueAt || null,
    calendar_start_at: input.kind === 'calendar' ? input.calendarStartAt || input.dueAt || null : null,
    calendar_end_at: input.kind === 'calendar' ? input.calendarEndAt || null : null,
    notify_portal: Boolean(input.notifyPortal),
    notify_email: Boolean(input.notifyEmail),
    contact_email: input.contactEmail?.trim() || null,
    created_by: createdBy ?? null,
    status: 'open' as const,
  };

  const { data, error } = await admin.from('customer_reminders').insert(row).select('*').single();
  if (error) throw new Error(error.message);

  const delivered = await deliverCustomerNotifications(data as CustomerReminderRow, company, input.customerExternalId);
  return mapReminderRow(delivered as CustomerReminderRow, input.customerExternalId);
}

export async function updateCustomerReminderStatus(
  reminderId: string,
  status: CustomerReminderStatus,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('customer_reminders').update({ status }).eq('id', reminderId);
  if (error) throw new Error(error.message);
}
