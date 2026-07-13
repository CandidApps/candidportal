import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getActiveConnectionForUserOrShared } from '@/lib/email/zoho-connections';
import {
  listDialpadRecapsDetailed,
  listInboxMessages,
  scopeHasCalendar,
  type InboxMessage,
} from '@/lib/email/zoho';
import { resolveExternallyHandledEmailIds } from '@/lib/assistant/email-reply-status';
import { enrichEventsWithFullDetails, listCalendars, listEventsAllCalendars } from '@/lib/calendar/zoho-calendar';
import { listAdminTeamMembers } from '@/lib/admin-team-members';
import { renderNoteBody } from '@/lib/admin-action-work';
import type {
  AssistantAction,
  AssistantCalendarEvent,
  AssistantEmailItem,
  AssistantMention,
  AssistantOverview,
  AssistantRecap,
} from '@/lib/assistant/types';

/** Unread @mentions addressed to this user, newest first. */
export async function loadMentions(userId: string): Promise<AssistantMention[]> {
  const admin = createSupabaseAdminClient();
  const { data: notifications } = await admin
    .from('team_mention_notifications')
    .select('id, note_id, message_id, channel_id, read_at, created_at')
    .eq('user_id', userId)
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(40);

  const rows = notifications ?? [];
  if (rows.length === 0) return [];

  const noteIds = [...new Set(rows.filter((n) => n.note_id).map((n) => String(n.note_id)))];
  const messageIds = [...new Set(rows.filter((n) => n.message_id).map((n) => String(n.message_id)))];
  const channelIds = [...new Set(rows.filter((n) => n.channel_id).map((n) => String(n.channel_id)))];

  const [notesRes, messagesRes, channelsRes, members] = await Promise.all([
    noteIds.length
      ? admin.from('team_notes').select('*').in('id', noteIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    messageIds.length
      ? admin.from('team_messages').select('*').in('id', messageIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    channelIds.length
      ? admin.from('team_channels').select('id, name, kind').in('id', channelIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    listAdminTeamMembers(admin),
  ]);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const noteById = new Map(
    ((notesRes.data ?? []) as Record<string, unknown>[]).map((n) => [String(n.id), n]),
  );
  const msgById = new Map(
    ((messagesRes.data ?? []) as Record<string, unknown>[]).map((m) => [String(m.id), m]),
  );
  const channelById = new Map(
    ((channelsRes.data ?? []) as Record<string, unknown>[]).map((c) => [String(c.id), c]),
  );

  const items: AssistantMention[] = [];
  for (const n of rows) {
    // Message Center channel / DM mention
    if (n.message_id) {
      const msg = msgById.get(String(n.message_id));
      if (!msg) continue;
      const authorId = String(msg.author_id);
      const body = String(msg.body);
      const channel = n.channel_id ? channelById.get(String(n.channel_id)) : undefined;
      const channelLabel = channel
        ? channel.kind === 'dm'
          ? 'Direct message'
          : `#${channel.name ?? 'channel'}`
        : 'Message Center';
      items.push({
        id: String(n.id),
        noteId: '',
        authorName: memberById.get(authorId)?.displayName ?? 'Team member',
        body,
        bodyHtml: renderNoteBody(body, members),
        createdAt: String(msg.created_at),
        readAt: (n.read_at as string) ?? null,
        contextLabel: channelLabel,
      });
      continue;
    }

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

/**
 * Set of action keys ("kind:sourceId") that someone has already claimed, so the
 * brief can highlight UNCLAIMED work that's nearing its SLA.
 */
export async function loadClaimedActionKeys(): Promise<Set<string>> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from('admin_action_work')
    .select('action_key, claimed_by')
    .not('claimed_by', 'is', null);
  return new Set((data ?? []).map((r) => String(r.action_key)));
}

export async function loadCalendar(
  userId: string,
  opts?: { enrich?: boolean },
): Promise<AssistantOverview['calendar']> {
  let conn;
  try {
    conn = await getActiveConnectionForUserOrShared(userId);
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
    const listed = await listEventsAllCalendars({
      accessToken: conn.accessToken,
      start,
      end,
      calendars,
    });
    const events =
      opts?.enrich === true
        ? await enrichEventsWithFullDetails({
            accessToken: conn.accessToken,
            calendarUid: primary.uid,
            events: listed,
            calendars,
            concurrency: 2,
            maxEnrich: 12,
            inviteFallback: true,
            accountId: conn.accountId,
          })
        : listed;
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

function eventMatchesEmails(event: AssistantCalendarEvent, emailSet: Set<string>): boolean {
  if (event.organizer && emailSet.has(event.organizer.trim().toLowerCase())) return true;
  for (const a of event.attendees) {
    const email = a.email?.trim().toLowerCase();
    if (email && emailSet.has(email)) return true;
  }
  return false;
}

/**
 * Calendar meetings (past + upcoming) that include any of the given contact emails
 * as organizer or attendee. Used by the account Communications panel.
 */
export async function loadCustomerMeetings(
  userId: string,
  emails: string[],
  opts?: { pastDays?: number; futureDays?: number },
): Promise<{
  connected: boolean;
  calendarScope: boolean;
  meetings: AssistantCalendarEvent[];
  error?: string;
}> {
  const emailSet = new Set(
    emails.map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@')),
  );
  if (!emailSet.size) {
    return { connected: true, calendarScope: true, meetings: [] };
  }

  let conn;
  try {
    conn = await getActiveConnectionForUserOrShared(userId);
  } catch {
    return { connected: false, calendarScope: false, meetings: [] };
  }
  if (!conn) return { connected: false, calendarScope: false, meetings: [] };
  if (!scopeHasCalendar(conn.scope)) {
    return { connected: true, calendarScope: false, meetings: [] };
  }

  const pastDays = Math.min(Math.max(opts?.pastDays ?? 90, 1), 180);
  const futureDays = Math.min(Math.max(opts?.futureDays ?? 60, 1), 120);

  try {
    const calendars = await listCalendars(conn.accessToken);
    const primary = calendars[0];
    if (!primary) return { connected: true, calendarScope: true, meetings: [] };

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - pastDays);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    end.setDate(end.getDate() + futureDays);

    const listed = await listEventsAllCalendars({
      accessToken: conn.accessToken,
      start,
      end,
      calendars,
    });

    // Prefer enriching timed meetings that might involve external attendees.
    const enrichCandidates = listed
      .filter((e) => !e.allDay)
      .sort(
        (a, b) =>
          Math.abs(Date.now() - new Date(a.start).getTime()) -
          Math.abs(Date.now() - new Date(b.start).getTime()),
      );

    const enriched = await enrichEventsWithFullDetails({
      accessToken: conn.accessToken,
      calendarUid: primary.uid,
      events: enrichCandidates,
      calendars,
      concurrency: 2,
      maxEnrich: 40,
      inviteFallback: true,
      accountId: conn.accountId,
    });

    const byId = new Map(listed.map((e) => [e.id, e]));
    for (const e of enriched) byId.set(e.id, e);

    const meetings = [...byId.values()]
      .filter((e) => !e.allDay && eventMatchesEmails(e, emailSet))
      .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());

    return { connected: true, calendarScope: true, meetings };
  } catch (err) {
    return {
      connected: true,
      calendarScope: true,
      meetings: [],
      error: err instanceof Error ? err.message : 'Calendar load failed',
    };
  }
}

function toEmailItem(m: InboxMessage): AssistantEmailItem {
  return {
    id: m.messageId,
    folderId: m.folderId,
    from: m.sender || m.fromAddress,
    fromAddress: m.fromAddress || m.sender,
    to: m.toAddress,
    cc: m.ccAddress,
    subject: m.subject,
    summary: m.summary,
    receivedTime: m.receivedTime,
    isUnread: m.isUnread,
  };
}

const RECAP_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'your', 'you', 'call', 'recap', 'summary', 'meeting',
  'meet', 'team', 'sync', 'review', 'follow', 'followup', 'notes', 'from', 'this',
  'that', 'are', 'was', 'has', 'have', 'will', 'about', 'into', 'com', 'net', 'org',
  'dialpad', 're', 'fwd',
]);

function recapTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9@.\s]/g, ' ')
      .split(/\s+/)
      .map((t) => t.replace(/^\.+|\.+$/g, ''))
      .filter((t) => t.length >= 3 && !RECAP_STOP_WORDS.has(t)),
  );
}

function tokenOverlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n += 1;
  return n;
}

const HOUR = 3_600_000;

/**
 * Matches a Dialpad recap email to a calendar event. Recap emails arrive shortly
 * AFTER a call ends, so we look for an event whose window precedes the recap
 * (from 30 min before start to 8 h after end), then score by: Dialpad conference
 * link, name/title overlap between the recap and the event's title + attendees,
 * and how soon after the meeting the recap landed. This is organizer-agnostic so
 * recaps still attach to meetings scheduled by someone else (e.g. a partner).
 */
function matchRecapToEvent(
  recap: { receivedTime: number; title: string; summary: string },
  events: AssistantOverview['calendar']['events'],
): string | null {
  const t = recap.receivedTime;
  if (!t) return null;
  const rTokens = recapTokens(`${recap.title} ${recap.summary}`);

  let best: string | null = null;
  let bestScore = 0;
  for (const e of events) {
    if (e.allDay) continue;
    const start = new Date(e.start).getTime();
    const end = new Date(e.end).getTime() || start;
    const windowStart = start - 0.5 * HOUR;
    const windowEnd = (end || start) + 8 * HOUR;
    if (t < windowStart || t > windowEnd) continue;

    const isDialpad = e.conferenceUrl ? /dialpad/i.test(e.conferenceUrl) : false;
    const attendeeText = e.attendees.map((a) => `${a.name} ${a.email}`).join(' ');
    const overlap = tokenOverlap(rTokens, recapTokens(`${e.title} ${attendeeText}`));

    // Require a real signal: either the meeting is a Dialpad call, or the recap
    // shares a name/topic with it. Avoids attaching recaps to unrelated meetings.
    if (!isDialpad && overlap === 0) continue;

    let score = overlap * 2;
    if (isDialpad) score += 3;
    const afterEnd = t - (end || start);
    if (afterEnd >= -0.5 * HOUR && afterEnd <= 4 * HOUR) score += 1;

    if (score > bestScore) {
      bestScore = score;
      best = e.id;
    }
  }
  return bestScore > 0 ? best : null;
}

/** Sets `matchedEventId` on each recap against the given event list. */
export function matchRecapsToEvents(
  recaps: AssistantRecap[],
  events: AssistantOverview['calendar']['events'],
): AssistantRecap[] {
  return recaps.map((r) => ({ ...r, matchedEventId: matchRecapToEvent(r, events) }));
}

/**
 * Loads recent Dialpad recap emails (unmatched). Callers match them to whichever
 * set of events they're displaying via {@link matchRecapsToEvents}.
 */
export async function loadRecaps(userId: string): Promise<AssistantRecap[]> {
  let conn;
  try {
    conn = await getActiveConnectionForUserOrShared(userId);
  } catch {
    return [];
  }
  if (!conn) return [];
  try {
    const detailed = await listDialpadRecapsDetailed({
      accessToken: conn.accessToken,
      accountId: conn.accountId,
      limit: 15,
    });
    return detailed.map((r) => ({
      id: r.emailId,
      folderId: r.folderId,
      title: r.title,
      from: r.fromAddress,
      receivedTime: r.receivedTime,
      summary: r.summary,
      actionItems: r.actionItems,
      recapUrl: r.recapUrl,
      matchedEventId: null,
    }));
  } catch {
    return [];
  }
}

export async function loadEmailAndRecaps(
  userId: string,
  events: AssistantOverview['calendar']['events'],
): Promise<{ email: AssistantOverview['email']; recaps: AssistantRecap[] }> {
  let conn;
  try {
    // Resolve the user's mailbox, falling back to the shared inbox even when the
    // personal connection throws a transient refresh error.
    conn = await getActiveConnectionForUserOrShared(userId);
  } catch {
    return { email: { connected: false, inbox: [], needsAction: [] }, recaps: [] };
  }
  if (!conn) return { email: { connected: false, inbox: [], needsAction: [] }, recaps: [] };

  try {
    const [inbox, recapsDetailed] = await Promise.all([
      listInboxMessages({ accessToken: conn.accessToken, accountId: conn.accountId, limit: 50 }),
      listDialpadRecapsDetailed({
        accessToken: conn.accessToken,
        accountId: conn.accountId,
        limit: 10,
      }).catch(() => []),
    ]);

    const inboxItems = inbox.map(toEmailItem);
    const externallyHandledIds = await resolveExternallyHandledEmailIds({
      accessToken: conn.accessToken,
      accountId: conn.accountId,
      mailbox: conn.email,
      inbox: inboxItems,
    }).catch(() => [] as string[]);
    const handledSet = new Set(externallyHandledIds);
    const needsAction = inboxItems
      .filter((m) => m.isUnread && !handledSet.has(m.id))
      .slice(0, 15);

    const recaps: AssistantRecap[] = matchRecapsToEvents(
      recapsDetailed.map((r) => ({
        id: r.emailId,
        folderId: r.folderId,
        title: r.title,
        from: r.fromAddress,
        receivedTime: r.receivedTime,
        summary: r.summary,
        actionItems: r.actionItems,
        recapUrl: r.recapUrl,
        matchedEventId: null,
      })),
      events,
    );

    return {
      email: { connected: true, mailbox: conn.email, inbox: inboxItems, needsAction, externallyHandledIds },
      recaps,
    };
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

  const [tickets, reviewReqs, quoteReqs, analysis, reminders] = await Promise.all([
    admin
      .from('customer_service_tickets')
      .select('id, subject, service_name, customer_name, customer_email, status, created_at')
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
      .from('quote_requests')
      .select('*')
      .in('status', ['open', 'in_progress', 'submitted'])
      .order('created_at', { ascending: false })
      .limit(40),
    admin
      .from('bill_analysis_reviews')
      .select('id, status, created_at, vendor_name, customer_name, customer_email')
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
      sourceId: String(t.id),
      ticketKind: 'service',
      title: String(t.subject ?? 'Support ticket'),
      subtitle: String(t.service_name ?? 'Customer ticket'),
      who: String(t.customer_name ?? ''),
      customerEmail: (t.customer_email as string | null) ?? null,
      customerId: null,
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
      sourceId: String(row.id),
      ticketKind: 'review_request',
      title: String(row.service_name ?? row.subject ?? 'Review request'),
      subtitle: 'Member review request',
      who: String(row.customer_name ?? row.customer_email ?? ''),
      customerEmail: (row.customer_email as string | null) ?? null,
      customerId: (row.crm_customer_id as string | null) ?? null,
      createdAt: String(row.created_at ?? new Date().toISOString()),
      dueAt: null,
      urgency: row.status === 'in_progress' ? 'normal' : 'warn',
    });
  }

  for (const q of quoteReqs.data ?? []) {
    const row = q as Record<string, unknown>;
    actions.push({
      id: `quote_request:${row.id}`,
      kind: 'quote_request',
      sourceId: String(row.id),
      ticketKind: 'quote_request',
      title: String(row.subject ?? 'Quote request'),
      subtitle: row.mode === 'add-services' ? 'Add services request' : 'New quote request',
      who: String(row.company ?? row.contact_name ?? row.contact_email ?? ''),
      customerEmail: (row.contact_email as string | null) ?? null,
      customerId: null,
      createdAt: String(row.created_at ?? new Date().toISOString()),
      dueAt: null,
      urgency: row.status === 'in_progress' ? 'normal' : 'urgent',
    });
  }

  for (const a of analysis.data ?? []) {
    const row = a as Record<string, unknown>;
    actions.push({
      id: `analysis_review:${row.id}`,
      kind: 'analysis_review',
      sourceId: String(row.id),
      ticketKind: 'analysis_review',
      title: String(row.vendor_name ?? 'Bill analysis'),
      subtitle: 'Analysis awaiting review',
      who: String(row.customer_name ?? ''),
      customerEmail: (row.customer_email as string | null) ?? null,
      customerId: null,
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
      sourceId: String(r.id),
      ticketKind: null,
      title: String(r.title ?? 'Reminder'),
      subtitle: r.kind === 'calendar' ? 'Calendar event' : 'CRM reminder',
      who: companyById.get(String(r.customer_id)) ?? '',
      customerEmail: null,
      customerId: r.customer_id ? String(r.customer_id) : null,
      createdAt: String(r.due_at ?? new Date().toISOString()),
      dueAt: due,
      urgency: urgencyFromDate(due),
    });
  }

  const rank = { urgent: 0, warn: 1, normal: 2 } as const;
  return actions.sort((a, b) => rank[a.urgency] - rank[b.urgency]);
}
