import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getActiveConnectionForUser } from '@/lib/email/zoho-connections';
import {
  listDialpadRecapsDetailed,
  listInboxMessages,
  scopeHasCalendar,
  type InboxMessage,
} from '@/lib/email/zoho';
import { listCalendars, listEvents } from '@/lib/calendar/zoho-calendar';
import type {
  AssistantAction,
  AssistantEmailItem,
  AssistantOverview,
  AssistantRecap,
} from '@/lib/assistant/types';

export async function loadCalendar(userId: string): Promise<AssistantOverview['calendar']> {
  let conn;
  try {
    conn = await getActiveConnectionForUser(userId);
  } catch {
    return { connected: false, calendarScope: false, events: [] };
  }
  if (!conn) return { connected: false, calendarScope: false, events: [] };
  if (!scopeHasCalendar(conn.scope)) {
    return { connected: true, calendarScope: false, events: [] };
  }
  try {
    const calendars = await listCalendars(conn.accessToken);
    const primary = calendars[0];
    if (!primary) return { connected: true, calendarScope: true, events: [] };
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const events = await listEvents({
      accessToken: conn.accessToken,
      calendarUid: primary.uid,
      start,
      end,
    });
    return { connected: true, calendarScope: true, events };
  } catch (err) {
    return {
      connected: true,
      calendarScope: true,
      events: [],
      error: err instanceof Error ? err.message : 'Calendar load failed',
    };
  }
}

function toEmailItem(m: InboxMessage): AssistantEmailItem {
  return {
    id: m.messageId,
    folderId: m.folderId,
    from: m.sender || m.fromAddress,
    subject: m.subject,
    summary: m.summary,
    receivedTime: m.receivedTime,
    isUnread: m.isUnread,
  };
}

/**
 * Matches a Dialpad recap to a calendar event: same calendar day, the event is
 * a Dialpad meeting, and the call time is within 2h of the event start.
 */
function matchRecapToEvent(
  recapTime: number,
  events: AssistantOverview['calendar']['events'],
): string | null {
  if (!recapTime) return null;
  const recap = new Date(recapTime);
  const sameDay = events.filter((e) => {
    const s = new Date(e.start);
    return (
      s.getFullYear() === recap.getFullYear() &&
      s.getMonth() === recap.getMonth() &&
      s.getDate() === recap.getDate() &&
      (e.conferenceUrl ? /dialpad/i.test(e.conferenceUrl) : true)
    );
  });
  if (!sameDay.length) return null;
  const recapMin = recap.getHours() * 60 + recap.getMinutes();
  let best: string | null = null;
  let bestDelta = Infinity;
  for (const e of sameDay) {
    const s = new Date(e.start);
    const delta = Math.abs(s.getHours() * 60 + s.getMinutes() - recapMin);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = e.id;
    }
  }
  return bestDelta <= 180 ? best : null;
}

export async function loadEmailAndRecaps(
  userId: string,
  events: AssistantOverview['calendar']['events'],
): Promise<{ email: AssistantOverview['email']; recaps: AssistantRecap[] }> {
  let conn;
  try {
    conn = await getActiveConnectionForUser(userId);
  } catch {
    return { email: { connected: false, inbox: [], needsAction: [] }, recaps: [] };
  }
  if (!conn) return { email: { connected: false, inbox: [], needsAction: [] }, recaps: [] };

  try {
    const [inbox, recapsDetailed] = await Promise.all([
      listInboxMessages({ accessToken: conn.accessToken, accountId: conn.accountId, limit: 30 }),
      listDialpadRecapsDetailed({
        accessToken: conn.accessToken,
        accountId: conn.accountId,
        limit: 10,
      }).catch(() => []),
    ]);

    const inboxItems = inbox.map(toEmailItem);
    const needsAction = inboxItems.filter((m) => m.isUnread).slice(0, 15);

    const recaps: AssistantRecap[] = recapsDetailed.map((r) => ({
      id: r.emailId,
      folderId: r.folderId,
      title: r.title,
      from: r.fromAddress,
      receivedTime: r.receivedTime,
      summary: r.summary,
      actionItems: r.actionItems,
      matchedEventId: matchRecapToEvent(r.receivedTime, events),
    }));

    return { email: { connected: true, inbox: inboxItems, needsAction }, recaps };
  } catch (err) {
    return {
      email: {
        connected: true,
        inbox: [],
        needsAction: [],
        error: err instanceof Error ? err.message : 'Inbox load failed',
      },
      recaps: [],
    };
  }
}

function urgencyFromDate(iso: string | null): AssistantAction['urgency'] {
  if (!iso) return 'normal';
  const due = new Date(iso).getTime();
  if (Number.isNaN(due)) return 'normal';
  const days = (due - Date.now()) / 86_400_000;
  if (days <= 0) return 'urgent';
  if (days <= 3) return 'warn';
  return 'normal';
}

export async function loadActions(): Promise<AssistantAction[]> {
  const admin = createSupabaseAdminClient();
  const actions: AssistantAction[] = [];

  const [tickets, reviewReqs, analysis, reminders] = await Promise.all([
    admin
      .from('customer_service_tickets')
      .select('id, subject, service_name, customer_name, status, created_at')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(40),
    admin
      .from('member_review_requests')
      .select('*')
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(40),
    admin
      .from('bill_analysis_reviews')
      .select('id, status, created_at, vendor_name, customer_name')
      .in('status', ['pending_review', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(40),
    admin
      .from('customer_reminders')
      .select('id, title, body, kind, due_at, calendar_start_at, status, customer_id')
      .eq('status', 'open')
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(60),
  ]);

  for (const t of tickets.data ?? []) {
    actions.push({
      id: `ticket:${t.id}`,
      kind: 'ticket',
      title: String(t.subject ?? 'Support ticket'),
      subtitle: String(t.service_name ?? 'Customer ticket'),
      who: String(t.customer_name ?? ''),
      createdAt: String(t.created_at),
      dueAt: null,
      urgency: 'warn',
    });
  }

  for (const r of reviewReqs.data ?? []) {
    const row = r as Record<string, unknown>;
    actions.push({
      id: `review_request:${row.id}`,
      kind: 'review_request',
      title: String(row.service_name ?? row.subject ?? 'Review request'),
      subtitle: 'Member review request',
      who: String(row.customer_name ?? row.contact_email ?? ''),
      createdAt: String(row.created_at ?? new Date().toISOString()),
      dueAt: null,
      urgency: row.status === 'in_progress' ? 'normal' : 'warn',
    });
  }

  for (const a of analysis.data ?? []) {
    const row = a as Record<string, unknown>;
    actions.push({
      id: `analysis_review:${row.id}`,
      kind: 'analysis_review',
      title: String(row.vendor_name ?? 'Bill analysis'),
      subtitle: 'Analysis awaiting review',
      who: String(row.customer_name ?? ''),
      createdAt: String(row.created_at ?? new Date().toISOString()),
      dueAt: null,
      urgency: row.status === 'pending_review' ? 'warn' : 'normal',
    });
  }

  const reminderRows = reminders.data ?? [];
  const customerIds = [...new Set(reminderRows.map((r) => String(r.customer_id)).filter(Boolean))];
  const companyById = new Map<string, string>();
  if (customerIds.length) {
    const { data: customers } = await admin
      .from('customers')
      .select('id, company')
      .in('id', customerIds);
    for (const c of customers ?? []) companyById.set(String(c.id), String(c.company ?? ''));
  }
  for (const r of reminderRows) {
    const due = (r.due_at as string | null) ?? (r.calendar_start_at as string | null) ?? null;
    actions.push({
      id: `reminder:${r.id}`,
      kind: 'reminder',
      title: String(r.title ?? 'Reminder'),
      subtitle: r.kind === 'calendar' ? 'Calendar event' : 'CRM reminder',
      who: companyById.get(String(r.customer_id)) ?? '',
      createdAt: String(r.due_at ?? new Date().toISOString()),
      dueAt: due,
      urgency: urgencyFromDate(due),
    });
  }

  const rank = { urgent: 0, warn: 1, normal: 2 } as const;
  return actions.sort((a, b) => rank[a.urgency] - rank[b.urgency]);
}
