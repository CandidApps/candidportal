import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getActiveConnectionForUser } from '@/lib/email/zoho-connections';
import { listDialpadRecaps, listInboxMessages, scopeHasCalendar } from '@/lib/email/zoho';
import { listCalendars, listEvents } from '@/lib/calendar/zoho-calendar';
import { listAdminTeamMembers } from '@/lib/admin-team-members';
import { renderNoteBody } from '@/lib/admin-action-work';
import type {
  AssistantAction,
  AssistantEmailItem,
  AssistantMention,
  AssistantOverview,
} from '@/lib/assistant/types';

export const dynamic = 'force-dynamic';

async function currentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

async function loadCalendar(userId: string): Promise<AssistantOverview['calendar']> {
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

async function loadEmail(
  userId: string,
): Promise<{ email: AssistantOverview['email']; recaps: AssistantEmailItem[] }> {
  let conn;
  try {
    conn = await getActiveConnectionForUser(userId);
  } catch {
    return { email: { connected: false, needsAction: [] }, recaps: [] };
  }
  if (!conn) return { email: { connected: false, needsAction: [] }, recaps: [] };

  const toItem = (m: {
    messageId: string;
    folderId: string;
    fromAddress: string;
    sender: string;
    subject: string;
    summary: string;
    receivedTime: number;
    isUnread: boolean;
  }): AssistantEmailItem => ({
    id: m.messageId,
    folderId: m.folderId,
    from: m.sender || m.fromAddress,
    subject: m.subject,
    summary: m.summary,
    receivedTime: m.receivedTime,
    isUnread: m.isUnread,
  });

  try {
    const [inbox, recaps] = await Promise.all([
      listInboxMessages({ accessToken: conn.accessToken, accountId: conn.accountId, limit: 30 }),
      listDialpadRecaps({ accessToken: conn.accessToken, accountId: conn.accountId, limit: 12 }).catch(
        () => [],
      ),
    ]);
    const needsAction = inbox
      .filter((m) => m.isUnread)
      .slice(0, 12)
      .map(toItem);
    return {
      email: { connected: true, needsAction },
      recaps: recaps.map(toItem),
    };
  } catch (err) {
    return {
      email: {
        connected: true,
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

async function loadActions(): Promise<AssistantAction[]> {
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

async function loadMentions(userId: string): Promise<AssistantMention[]> {
  const admin = createSupabaseAdminClient();
  const { data: notifications } = await admin
    .from('team_mention_notifications')
    .select('id, note_id, read_at, created_at')
    .eq('user_id', userId)
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(40);

  const noteIds = [...new Set((notifications ?? []).map((n) => String(n.note_id)))];
  if (noteIds.length === 0) return [];

  const [{ data: notes }, members] = await Promise.all([
    admin.from('team_notes').select('*').in('id', noteIds),
    listAdminTeamMembers(admin),
  ]);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const noteById = new Map((notes ?? []).map((n) => [String(n.id), n as Record<string, unknown>]));

  const items: AssistantMention[] = [];
  for (const n of notifications ?? []) {
    const note = noteById.get(String(n.note_id));
    if (!note) continue;
    const authorId = String(note.author_id);
    const contextType = String(note.context_type);
    const body = String(note.body);
    items.push({
      id: String(n.id),
      noteId: String(n.note_id),
      authorName: memberById.get(authorId)?.displayName ?? 'Team member',
      body,
      bodyHtml: renderNoteBody(body, members),
      createdAt: String(note.created_at),
      readAt: (n.read_at as string) ?? null,
      contextLabel:
        contextType === 'task'
          ? 'Task thread'
          : contextType === 'customer'
            ? 'Account note'
            : contextType === 'contact'
              ? 'Contact note'
              : 'Action Center',
    });
  }
  return items;
}

export async function GET() {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [calendar, emailResult, actions, mentions] = await Promise.all([
    loadCalendar(userId),
    loadEmail(userId),
    loadActions(),
    loadMentions(userId),
  ]);

  const overview: AssistantOverview = {
    calendar,
    email: emailResult.email,
    recaps: emailResult.recaps,
    actions,
    mentions,
    counts: {
      actions: actions.length,
      mentions: mentions.length,
      eventsToday: calendar.events.filter((e) => isToday(e.start)).length,
      emails: emailResult.email.needsAction.length,
    },
  };

  return NextResponse.json(overview);
}
