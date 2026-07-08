// Shared types for the MyAssistant admin page + its client fetchers.

export type AssistantEventAttendee = {
  name: string;
  email: string;
  status: 'accepted' | 'declined' | 'tentative' | 'pending';
  /** True when this attendee is the meeting organizer. */
  isOrganizer?: boolean;
};

export type AssistantCalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  description: string | null;
  dialpadRecapUrl: string | null;
  conferenceUrl: string | null;
  attendees: AssistantEventAttendee[];
  attendeeCount: number;
  /** True when attendees were loaded from Zoho's event-detail API. */
  attendeesComplete: boolean;
  /** Zoho calendar uid — pass when fetching event detail. */
  calendarUid?: string;
  etag: string | null;
  /** Organizer email, when Zoho provides one. */
  organizer: string | null;
  /** Organizer display name, when Zoho provides one. */
  organizerName: string | null;
};

export type AssistantEmailItem = {
  id: string;
  folderId: string;
  /** Display string for the sender (name or "Name <email>"). */
  from: string;
  /** The sender's bare email address, for replying. */
  fromAddress: string;
  /** Raw To recipients of the original message (for reply-all). */
  to: string;
  /** Raw Cc recipients of the original message (for reply-all). */
  cc: string;
  subject: string;
  summary: string;
  receivedTime: number;
  isUnread: boolean;
};

export type AssistantRecap = {
  id: string;
  folderId: string;
  title: string;
  from: string;
  receivedTime: number;
  summary: string;
  actionItems: string[];
  /** Dialpad call-review page URL from the recap email, when present. */
  recapUrl: string | null;
  /** Calendar event id this recap was matched to, if any. */
  matchedEventId: string | null;
};

export type AssistantCall = {
  id: string;
  direction: 'inbound' | 'outbound' | 'unknown';
  state: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  agentName: string | null;
  startedAt: string | null;
  durationSeconds: number | null;
  wasRecorded: boolean;
  recordingUrl: string | null;
  transcriptText: string | null;
  recapSummary: string | null;
  /** Matched CRM account, when the caller maps to a known contact. */
  customerId: string | null;
};

export type AssistantActionKind = 'ticket' | 'review_request' | 'quote_request' | 'analysis_review' | 'reminder';

export type AssistantAction = {
  id: string;
  kind: AssistantActionKind;
  /** Raw row id (uuid) without the kind prefix. */
  sourceId: string;
  /** AdminTicketKind used for action-work + action-center deep links (null = no detail view). */
  ticketKind: string | null;
  title: string;
  subtitle: string;
  who: string;
  /** Email of the customer/contact tied to this action, for account lookup. */
  customerEmail: string | null;
  /** CRM customer id when known directly (e.g. reminders). */
  customerId: string | null;
  createdAt: string;
  dueAt: string | null;
  urgency: 'normal' | 'warn' | 'urgent';
};

export type AssistantMention = {
  id: string;
  noteId: string;
  authorName: string;
  body: string;
  bodyHtml: string;
  createdAt: string;
  readAt: string | null;
  contextLabel: string;
};

export type AssistantOverview = {
  calendar: {
    connected: boolean;
    calendarScope: boolean;
    events: AssistantCalendarEvent[];
    error?: string;
  };
  email: {
    connected: boolean;
    /** The connected mailbox address (so the client can exclude self on reply-all). */
    mailbox?: string;
    /** Recent inbox messages (read + unread) used for triage. */
    inbox: AssistantEmailItem[];
    needsAction: AssistantEmailItem[];
    error?: string;
  };
  recaps: AssistantRecap[];
  actions: AssistantAction[];
  mentions: AssistantMention[];
  /** Recent Dialpad calls (empty when Dialpad isn't configured). */
  calls: AssistantCall[];
  callsConnected: boolean;
  counts: { actions: number; mentions: number; eventsToday: number; emails: number; calls: number };
};

// ── AI brief + triage ──────────────────────────────────────────────

/** Optional deep-link a brief item points to so it's actionable. */
export type AssistantRef =
  | { type: 'email'; id: string }
  | { type: 'action'; id: string }
  | { type: 'recap'; id: string }
  | { type: 'mention'; id: string }
  | { type: 'call'; id: string }
  | { type: 'calendar' }
  | { type: 'task' };

/**
 * What the brief item is really asking the user to do, so the UI can offer the
 * matching call-to-action (reply to an email, schedule a meeting, etc.).
 */
export type AssistantIntent = 'reply' | 'schedule' | 'open' | 'call' | 'review';

export type AssistantPriority = {
  title: string;
  why: string;
  ref?: AssistantRef | null;
  intent?: AssistantIntent | null;
  /** ISO date the underlying item was first seen / mentioned. */
  since?: string | null;
};

/** A carry-over item that was open before today and still isn't done. */
export type AssistantMissed = {
  title: string;
  why: string;
  ref?: AssistantRef | null;
  intent?: AssistantIntent | null;
  since?: string | null;
};

export type AssistantBrief = {
  weekStatus: string;
  highlights: string[];
  priorities: AssistantPriority[];
  missed: AssistantMissed[];
  recommendation: string;
  recommendationRef?: AssistantRef | null;
  recommendationIntent?: AssistantIntent | null;
  generatedAt: string | null;
};

export type TriagedEmail = {
  id: string;
  contact: string;
  business: string;
  title: string;
  subject: string;
  insight: string;
  tag: 'urgent' | 'partner' | 'customer' | 'renewal';
  section: 'urgent' | 'action' | 'monitor';
  /** Sender email + folder, so a reply can open even if the message has since
   *  rolled out of the live inbox window. */
  fromAddress?: string;
  folderId?: string;
  /** When the email was received (epoch ms), for showing date/time on the row. */
  receivedTime?: number;
};

export type AssistantBriefResult = {
  brief: AssistantBrief;
  triagedEmails: TriagedEmail[];
};

export type AssistantContextScope = 'personal' | 'team';

export type AssistantContextItem = {
  id: string;
  subject: string;
  info: string;
  source: string;
  scope: AssistantContextScope;
  createdAt: string;
};

export type AssistantChatAction =
  | { type: 'add_task'; title: string; priority?: AssistantTaskPriority; ownerId?: string }
  | { type: 'remember'; subject: string; info: string; scope?: AssistantContextScope };

export type AssistantChatResult = {
  message: string;
  actions: AssistantChatAction[];
};

export type AssistantTaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type AssistantTaskStatus = 'open' | 'in_progress' | 'done';

export type AssistantTaskComment = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  bodyHtml: string;
  createdAt: string;
};

export type AssistantTask = {
  id: string;
  ownerId: string;
  ownerName: string;
  createdBy: string;
  createdByName: string;
  title: string;
  notes: string | null;
  notesHtml: string | null;
  priority: AssistantTaskPriority;
  status: AssistantTaskStatus;
  dueDate: string | null;
  dueAt: string | null;
  originalDueAt: string | null;
  source: string;
  sourceRef: string | null;
  sourceMeta: import('@/lib/assistant/task-source').AssistantTaskSourceMeta | null;
  createdAt: string;
  updatedAt: string;
  mine: boolean;
};

// ── Client fetchers ────────────────────────────────────────────────

/**
 * Parses a fetch Response as JSON without throwing the cryptic
 * "Unexpected end of JSON input" when the body is empty or not JSON (e.g. a
 * gateway timeout, 204, or an HTML error page). Returns {} for an empty body.
 */
async function safeJson<T>(res: Response): Promise<T & { error?: string }> {
  const text = await res.text().catch(() => '');
  if (!text.trim()) {
    if (!res.ok) {
      throw new Error(
        res.status === 504 || res.status === 408
          ? 'The request timed out. Please try again.'
          : `Request failed (${res.status || 'network error'}).`,
      );
    }
    return {} as T & { error?: string };
  }
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error(
      `Unexpected response from server (${res.status}). ${text.slice(0, 140)}`.trim(),
    );
  }
}

export async function fetchAssistantOverview(opts?: { callsScope?: 'mine' | 'team' }): Promise<AssistantOverview> {
  const qs = opts?.callsScope === 'team' ? '?calls=team' : '';
  const res = await fetch(`/api/admin/assistant/overview${qs}`);
  if (!res.ok) throw new Error('Failed to load assistant overview');
  return (await res.json()) as AssistantOverview;
}

export async function fetchAssistantTasks(scope: 'mine' | 'team' = 'mine'): Promise<AssistantTask[]> {
  const res = await fetch(`/api/admin/assistant/tasks?scope=${scope}`);
  if (!res.ok) throw new Error('Failed to load tasks');
  const json = (await res.json()) as { tasks?: AssistantTask[] };
  return json.tasks ?? [];
}

export async function createAssistantTask(input: {
  title: string;
  notes?: string;
  notesHtml?: string | null;
  priority?: AssistantTaskPriority;
  dueDate?: string | null;
  dueAt?: string | null;
  ownerId?: string;
  source?: string;
  sourceRef?: string;
  sourceMeta?: import('@/lib/assistant/task-source').AssistantTaskSourceMeta | null;
}): Promise<AssistantTask> {
  const res = await fetch('/api/admin/assistant/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as { task?: AssistantTask; error?: string };
  if (!res.ok || !json.task) throw new Error(json.error ?? 'Failed to create task');
  return json.task;
}

export async function updateAssistantTask(
  id: string,
  patch: Partial<{
    title: string;
    notes: string | null;
    notesHtml: string | null;
    priority: AssistantTaskPriority;
    status: AssistantTaskStatus;
    dueDate: string | null;
    dueAt: string | null;
    ownerId: string;
    sourceMeta: import('@/lib/assistant/task-source').AssistantTaskSourceMeta | null;
  }>,
): Promise<AssistantTask> {
  const res = await fetch(`/api/admin/assistant/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const json = (await res.json()) as { task?: AssistantTask; error?: string };
  if (!res.ok || !json.task) throw new Error(json.error ?? 'Failed to update task');
  return json.task;
}

export async function deleteAssistantTask(id: string): Promise<void> {
  const res = await fetch(`/api/admin/assistant/tasks/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete task');
}

export async function fetchAssistantBrief(
  refresh = false,
  opts?: { force?: boolean },
): Promise<AssistantBriefResult> {
  const params = new URLSearchParams();
  if (refresh) params.set('refresh', '1');
  if (opts?.force) params.set('force', '1');
  const qs = params.toString();
  const res = await fetch(`/api/admin/assistant/brief${qs ? `?${qs}` : ''}`, {
    method: refresh ? 'POST' : 'GET',
  });
  const json = (await res.json().catch(() => ({}))) as AssistantBriefResult & {
    error?: string;
    cached?: boolean;
  };
  if (!res.ok) throw new Error(json.error ?? 'Failed to load brief');
  return json;
}

export async function syncDialpadCalls(
  days = 14,
): Promise<{ synced: number; configured: boolean; fetched?: number; error?: string }> {
  const res = await fetch(`/api/admin/dialpad/sync?days=${days}`, { method: 'POST' });
  const json = (await res.json().catch(() => ({}))) as {
    synced?: number;
    configured?: boolean;
    fetched?: number;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? 'Failed to sync calls');
  return {
    synced: json.synced ?? 0,
    configured: Boolean(json.configured),
    fetched: json.fetched,
    error: json.error,
  };
}

export type DialpadDiagnostics = {
  configured?: boolean;
  hint?: string;
  lookbackDays?: number;
  companyWide?: { ok: boolean; status: number; count: number; error?: string };
  usersFound?: number;
  sampleUsers?: { id: string; name: string | null }[];
  usersError?: string;
  perUserProbe?: { ok: boolean; status: number; count: number; error?: string };
  error?: string;
};

export async function fetchDialpadDiagnostics(days = 7): Promise<DialpadDiagnostics> {
  const res = await fetch(`/api/admin/dialpad/sync?days=${days}`);
  const json = (await res.json().catch(() => ({}))) as DialpadDiagnostics & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Dialpad diagnostic failed (${res.status})`);
  return json;
}

export async function fetchAssistantContext(): Promise<AssistantContextItem[]> {
  const res = await fetch('/api/admin/assistant/context');
  if (!res.ok) throw new Error('Failed to load memory');
  const json = (await res.json()) as { items?: AssistantContextItem[] };
  return json.items ?? [];
}

export async function addAssistantContext(input: {
  subject: string;
  info: string;
  scope?: AssistantContextScope;
}): Promise<AssistantContextItem> {
  const res = await fetch('/api/admin/assistant/context', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as { item?: AssistantContextItem; error?: string };
  if (!res.ok || !json.item) throw new Error(json.error ?? 'Failed to save');
  return json.item;
}

export async function deleteAssistantContext(id: string): Promise<void> {
  const res = await fetch(`/api/admin/assistant/context/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete');
}

// ── Calendar (week navigation + write) ─────────────────────────────

export type CalendarWeekResult = {
  connected: boolean;
  calendarScope: boolean;
  calendarUid: string | null;
  events: AssistantCalendarEvent[];
  /** Dialpad recaps matched to the events in this week (matchedEventId set). */
  recaps?: AssistantRecap[];
  error?: string;
};

export async function fetchCalendarWeek(weekOffset: number): Promise<CalendarWeekResult> {
  const res = await fetch(`/api/admin/assistant/calendar?weekOffset=${weekOffset}`);
  if (!res.ok) throw new Error('Failed to load calendar');
  return (await res.json()) as CalendarWeekResult;
}

/** Fetches a single event's full detail (complete attendee list with emails). */
export async function fetchCalendarEvent(
  eventUid: string,
  calendarUid?: string,
): Promise<AssistantCalendarEvent | null> {
  const q = calendarUid ? `?calendarUid=${encodeURIComponent(calendarUid)}` : '';
  const res = await fetch(`/api/admin/assistant/calendar/${encodeURIComponent(eventUid)}${q}`);
  const json = await safeJson<{ event?: AssistantCalendarEvent }>(res);
  if (!res.ok) throw new Error(json.error ?? 'Failed to load event');
  return json.event ?? null;
}

export type CalendarEventInput = {
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  location?: string | null;
  description?: string | null;
  meetingUrl?: string | null;
  attendees?: string[];
};

export async function createCalendarEvent(input: CalendarEventInput): Promise<void> {
  const res = await fetch('/api/admin/assistant/calendar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? 'Failed to create event');
}

export async function updateCalendarEvent(
  eventUid: string,
  input: CalendarEventInput & { etag?: string | null },
): Promise<void> {
  const res = await fetch(`/api/admin/assistant/calendar/${encodeURIComponent(eventUid)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? 'Failed to update event');
}

export async function deleteCalendarEvent(eventUid: string, etag?: string | null): Promise<void> {
  const res = await fetch(
    `/api/admin/assistant/calendar/${encodeURIComponent(eventUid)}${etag ? `?etag=${encodeURIComponent(etag)}` : ''}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error('Failed to delete event');
}

// ── Free / busy availability ────────────────────────────────────────

export type FreeBusyInterval = { start: string; end: string };

export type FreeBusyResult = {
  connected: boolean;
  freebusyScope: boolean;
  busyByEmail: Record<string, FreeBusyInterval[]>;
  error?: string;
};

export async function fetchFreeBusy(
  emails: string[],
  start: string,
  end: string,
): Promise<FreeBusyResult> {
  const params = new URLSearchParams({ emails: emails.join(','), start, end });
  const res = await fetch(`/api/admin/assistant/freebusy?${params.toString()}`);
  const json = await safeJson<FreeBusyResult>(res);
  if (!res.ok) throw new Error(json.error ?? 'Failed to load availability');
  return {
    connected: Boolean(json.connected),
    freebusyScope: Boolean(json.freebusyScope),
    busyByEmail: json.busyByEmail ?? {},
    error: json.error,
  };
}

// ── AI reply draft ─────────────────────────────────────────────────

export type ReplyDraftResult = {
  draft: string;
  to: string;
  subject: string;
  knowledge: string[];
};

export async function fetchReplyDraft(input: {
  messageId?: string;
  folderId?: string;
  from: string;
  to?: string;
  subject: string;
  hint?: string;
  mode?: 'reply' | 'new';
}): Promise<ReplyDraftResult> {
  const res = await fetch('/api/admin/assistant/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await safeJson<ReplyDraftResult>(res);
  if (!res.ok) throw new Error(json.error ?? 'Failed to draft reply');
  return json;
}

export async function sendEmailReply(input: {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const res = await fetch('/api/admin/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? 'Failed to send');
}

// ── Portal contact directory (email autocomplete) ──────────────────

export type PortalContactType = 'account' | 'supplier' | 'team';

export type PortalContact = {
  name: string;
  email: string;
  org: string | null;
  type: PortalContactType;
};

export async function searchPortalContacts(query: string): Promise<PortalContact[]> {
  const res = await fetch(`/api/admin/contacts/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const json = (await res.json().catch(() => ({}))) as { contacts?: PortalContact[] };
  return json.contacts ?? [];
}

/** Full contact directory for inbox filtering (accounts, suppliers, team). */
export async function fetchPortalContactDirectory(): Promise<PortalContact[]> {
  const res = await fetch('/api/admin/contacts/search?all=1');
  if (!res.ok) return [];
  const json = (await res.json().catch(() => ({}))) as { contacts?: PortalContact[] };
  return json.contacts ?? [];
}

export async function sendAssistantChat(
  messages: { role: 'user' | 'assistant'; content: string }[],
): Promise<AssistantChatResult> {
  const res = await fetch('/api/admin/assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  const json = (await res.json()) as AssistantChatResult & { error?: string };
  if (!res.ok) throw new Error(json.error ?? 'Chat failed');
  return { message: json.message, actions: json.actions ?? [] };
}
