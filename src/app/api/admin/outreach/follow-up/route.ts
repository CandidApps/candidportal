import { NextResponse } from 'next/server';
import { listAdminTeamMembers } from '@/lib/admin-team-members';
import { getMyRole } from '@/lib/auth/roles';
import { OUTREACH_HELP_LABELS, OUTREACH_STATUS_LABELS } from '@/lib/outreach';
import {
  loadOutreachCompanyAndContacts,
  logOutreachToCustomerAccount,
  outreachRowToItem,
  type OutreachDbRow,
} from '@/lib/outreach-server';
import { createCustomerReminder } from '@/lib/services/customer-reminders';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function currentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Create a CRM follow-up reminder (action) or portal lead from an outreach row. */
export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { id?: unknown; kind?: unknown };
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const kind = body.kind === 'lead' ? 'lead' : body.kind === 'action' ? 'action' : '';
  if (!id || !kind) return NextResponse.json({ error: 'id and kind required' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('admin_outreach_accounts')
    .select('*')
    .eq('id', id)
    .eq('owner_user_id', userId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found or not owned by you' }, { status: 404 });

  const row = data as OutreachDbRow;
  const team = await listAdminTeamMembers(admin);
  const ownersById = new Map(
    team.map((m) => [m.id, { id: m.id, email: m.email, displayName: m.displayName }]),
  );
  const { companyByExternalId, contactsByExternalId } = await loadOutreachCompanyAndContacts(admin, [
    row.customer_external_id,
  ]);
  const item = outreachRowToItem(row, companyByExternalId, contactsByExternalId, ownersById);

  // Idempotent: do not create duplicate linked leads/actions.
  if (kind === 'action' && item.linkedReminderId) {
    return NextResponse.json({
      item,
      reminderId: item.linkedReminderId,
      alreadyLinked: true,
    });
  }
  if (kind === 'lead' && item.linkedLeadId) {
    return NextResponse.json({
      item,
      leadId: item.linkedLeadId,
      alreadyLinked: true,
    });
  }

  const helpLabel = OUTREACH_HELP_LABELS[item.howCanWeHelp];
  const statusLabel = OUTREACH_STATUS_LABELS[item.status];
  const assigneeIds = item.assignedUserIds.length
    ? item.assignedUserIds
    : item.followUpOwnerUserId
      ? [item.followUpOwnerUserId]
      : [userId];
  const assigneeNames =
    item.assignedDisplayNames?.join(', ') || item.followUpOwnerDisplayName || 'Assigned';
  const contact = item.contact;
  const dueAt = item.nextFollowUpAt ? `${item.nextFollowUpAt}T17:00:00.000Z` : undefined;

  const detailParts = [
    `Outreach status: ${statusLabel}`,
    `Category: ${helpLabel}`,
    contact ? `Contact: ${contact.name}${contact.email ? ` (${contact.email})` : ''}` : null,
    item.currentProvider ? `Current provider: ${item.currentProvider}` : null,
    item.painPoints ? `Pain points: ${item.painPoints}` : null,
    item.notes ? `Notes: ${item.notes}` : null,
    `Assigned: ${assigneeNames}`,
  ].filter(Boolean);

  const patch: Record<string, unknown> = {};
  let reminderId: string | undefined;
  let leadId: string | undefined;

  if (kind === 'action') {
    try {
      const reminder = await createCustomerReminder(
        {
          customerExternalId: item.customerExternalId,
          kind: 'reminder',
          title: `Outreach follow-up — ${item.company}`,
          body: detailParts.join('\n'),
          dueAt,
          contactEmail: contact?.email || undefined,
          notifyPortal: false,
          notifyEmail: false,
        },
        assigneeIds[0] ?? userId,
      );
      reminderId = reminder.id;
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to create follow-up action' },
        { status: 500 },
      );
    }
    patch.linked_reminder_id = reminderId;
    if (item.status === 'not_started' || item.status === 'attempted_contact') {
      patch.status = 'follow_up_needed';
    }
  } else {
    // Snapshot contact fields into lead_data (portal_leads pattern) — does not create CRM contacts.
    const leadData = {
      id: `lead-outreach-${item.id}`,
      companyFriendly: item.company,
      helpWith: helpLabel,
      currentTechnology: item.currentProvider || undefined,
      status: 'new' as const,
      source: 'manual' as const,
      lifecycle: 'open' as const,
      createdAt: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      notes: [item.notes, item.painPoints ? `Pain points: ${item.painPoints}` : null]
        .filter(Boolean)
        .join('\n'),
      contacts: contact
        ? [
            {
              id: `lc-${contact.id}`,
              name: contact.name,
              email: contact.email,
              phone: contact.phone,
              role: contact.role || 'Contact',
              isDecisionMaker: true,
              isPrimary: true,
            },
          ]
        : [],
      locations: [],
      // Link back to CRM account without duplicating the customer row.
      convertedCustomerId: undefined,
      crmCustomerExternalId: item.customerExternalId,
    };

    const { data: leadRow, error: leadErr } = await admin
      .from('portal_leads')
      .insert({
        analysis_review_id: null,
        quote_request_id: null,
        user_id: assigneeIds[0] ?? userId,
        lead_source: 'manual',
        lifecycle: 'open',
        lead_data: leadData,
      })
      .select('id')
      .single();
    if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 500 });
    leadId = String(leadRow.id);
    patch.linked_lead_id = leadId;
    if (item.status !== 'opportunity_identified' && item.status !== 'completed') {
      patch.status = 'opportunity_identified';
    }
  }

  const { data: updated, error: updErr } = await admin
    .from('admin_outreach_accounts')
    .update(patch)
    .eq('id', id)
    .eq('owner_user_id', userId)
    .select('*')
    .maybeSingle();
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  const nextItem = outreachRowToItem(
    (updated ?? row) as OutreachDbRow,
    companyByExternalId,
    contactsByExternalId,
    ownersById,
  );
  try {
    await logOutreachToCustomerAccount(admin, {
      authorId: userId,
      customerExternalId: nextItem.customerExternalId,
      company: nextItem.company,
      item: nextItem,
      activityNote:
        kind === 'action'
          ? `Created follow-up action/reminder from Outreach${reminderId ? ` (${reminderId})` : ''}.`
          : `Created lead from Outreach${leadId ? ` (${leadId})` : ''}.`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        item: nextItem,
        reminderId,
        leadId,
        warning: err instanceof Error ? err.message : 'Follow-up created but account note failed',
      },
      { status: 200 },
    );
  }

  return NextResponse.json({ item: nextItem, reminderId, leadId, alreadyLinked: false });
}
