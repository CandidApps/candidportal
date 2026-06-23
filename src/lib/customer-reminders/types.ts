export type CustomerReminderKind = 'task' | 'reminder' | 'calendar';
export type CustomerReminderStatus = 'open' | 'completed' | 'cancelled';

export type CustomerReminderRow = {
  id: string;
  customer_id: string;
  deal_external_id: string | null;
  kind: CustomerReminderKind;
  title: string;
  body: string | null;
  due_at: string | null;
  calendar_start_at: string | null;
  calendar_end_at: string | null;
  notify_portal: boolean;
  notify_email: boolean;
  contact_email: string | null;
  portal_notified_at: string | null;
  email_sent_at: string | null;
  created_by: string | null;
  status: CustomerReminderStatus;
  created_at: string;
  updated_at: string;
};

export type CustomerReminder = {
  id: string;
  customerId: string;
  dealExternalId?: string;
  kind: CustomerReminderKind;
  title: string;
  body?: string;
  dueAt?: string;
  calendarStartAt?: string;
  calendarEndAt?: string;
  notifyPortal: boolean;
  notifyEmail: boolean;
  contactEmail?: string;
  portalNotifiedAt?: string;
  emailSentAt?: string;
  status: CustomerReminderStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateCustomerReminderInput = {
  customerExternalId: string;
  dealExternalId?: string;
  kind: CustomerReminderKind;
  title: string;
  body?: string;
  dueAt?: string;
  calendarStartAt?: string;
  calendarEndAt?: string;
  notifyPortal?: boolean;
  notifyEmail?: boolean;
  contactEmail?: string;
};

export const REMINDER_KIND_LABELS: Record<CustomerReminderKind, string> = {
  task: 'Task',
  reminder: 'Reminder',
  calendar: 'Calendar event',
};

export function mapReminderRow(row: CustomerReminderRow, customerExternalId: string): CustomerReminder {
  return {
    id: row.id,
    customerId: customerExternalId,
    dealExternalId: row.deal_external_id ?? undefined,
    kind: row.kind,
    title: row.title,
    body: row.body ?? undefined,
    dueAt: row.due_at ?? undefined,
    calendarStartAt: row.calendar_start_at ?? undefined,
    calendarEndAt: row.calendar_end_at ?? undefined,
    notifyPortal: row.notify_portal,
    notifyEmail: row.notify_email,
    contactEmail: row.contact_email ?? undefined,
    portalNotifiedAt: row.portal_notified_at ?? undefined,
    emailSentAt: row.email_sent_at ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function formatReminderWhen(reminder: CustomerReminder): string {
  if (reminder.kind === 'calendar') {
    const start = reminder.calendarStartAt ? new Date(reminder.calendarStartAt) : null;
    const end = reminder.calendarEndAt ? new Date(reminder.calendarEndAt) : null;
    if (start && !Number.isNaN(start.getTime())) {
      const startTxt = start.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      if (end && !Number.isNaN(end.getTime())) {
        const endTxt = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        return `${startTxt} – ${endTxt}`;
      }
      return startTxt;
    }
    return '—';
  }
  if (!reminder.dueAt) return 'No due date';
  const d = new Date(reminder.dueAt);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
