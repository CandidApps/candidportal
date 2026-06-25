// Shared types for the MyAssistant admin page + its client fetchers.

export type AssistantEventAttendee = {
  name: string;
  email: string;
  status: 'accepted' | 'declined' | 'tentative' | 'pending';
};

export type AssistantCalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  description: string | null;
  conferenceUrl: string | null;
  attendees: AssistantEventAttendee[];
  attendeeCount: number;
  etag: string | null;
  organizer: string | null;
};

export type AssistantEmailItem = {
  id: string;
  folderId: string;
  from: string;
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
  /** Calendar event id this recap was matched to, if any. */
  matchedEventId: string | null;
};

export type AssistantActionKind = 'ticket' | 'review_request' | 'analysis_review' | 'reminder';

export type AssistantAction = {
  id: string;
  kind: AssistantActionKind;
  title: string;
  subtitle: string;
  who: string;
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
    /** Recent inbox messages (read + unread) used for triage. */
    inbox: AssistantEmailItem[];
    needsAction: AssistantEmailItem[];
    error?: string;
  };
  recaps: AssistantRecap[];
  actions: AssistantAction[];
  mentions: AssistantMention[];
  counts: { actions: number; mentions: number; eventsToday: number; emails: number };
};

// ── AI brief + triage ──────────────────────────────────────────────

/** Optional deep-link a brief item points to so it's actionable. */
export type AssistantRef =
  | { type: 'email'; id: string }
  | { type: 'action'; id: string }
  | { type: 'recap'; id: string }
  | { type: 'calendar' }
  | { type: 'task' };

export type AssistantPriority = { title: string; why: string; ref?: AssistantRef | null };

export type AssistantBrief = {
  weekStatus: string;
  highlights: string[];
  priorities: AssistantPriority[];
  recommendation: string;
  recommendationRef?: AssistantRef | null;
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
};

export type AssistantBriefResult = {
  brief: AssistantBrief;
  triagedEmails: TriagedEmail[];
};

export type AssistantContextItem = {
  id: string;
  subject: string;
  info: string;
  source: string;
  createdAt: string;
};

export type AssistantChatAction =
  | { type: 'add_task'; title: string; priority?: AssistantTaskPriority; ownerId?: string }
  | { type: 'remember'; subject: string; info: string };

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
  priority: AssistantTaskPriority;
  status: AssistantTaskStatus;
  dueDate: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
  mine: boolean;
};

// ── Client fetchers ────────────────────────────────────────────────

export async function fetchAssistantOverview(): Promise<AssistantOverview> {
  const res = await fetch('/api/admin/assistant/overview');
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
  priority?: AssistantTaskPriority;
  dueDate?: string | null;
  ownerId?: string;
  source?: string;
  sourceRef?: string;
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
    priority: AssistantTaskPriority;
    status: AssistantTaskStatus;
    dueDate: string | null;
    ownerId: string;
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

export async function fetchAssistantBrief(refresh = false): Promise<AssistantBriefResult> {
  const res = await fetch(`/api/admin/assistant/brief${refresh ? '?refresh=1' : ''}`, {
    method: refresh ? 'POST' : 'GET',
  });
  if (!res.ok) throw new Error('Failed to load brief');
  return (await res.json()) as AssistantBriefResult;
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
  error?: string;
};

export async function fetchCalendarWeek(weekOffset: number): Promise<CalendarWeekResult> {
  const res = await fetch(`/api/admin/assistant/calendar?weekOffset=${weekOffset}`);
  if (!res.ok) throw new Error('Failed to load calendar');
  return (await res.json()) as CalendarWeekResult;
}

export type CalendarEventInput = {
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  location?: string | null;
  description?: string | null;
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
  subject: string;
  hint?: string;
}): Promise<ReplyDraftResult> {
  const res = await fetch('/api/admin/assistant/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as ReplyDraftResult & { error?: string };
  if (!res.ok) throw new Error(json.error ?? 'Failed to draft reply');
  return json;
}

export async function sendEmailReply(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const res = await fetch('/api/admin/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: input.to, subject: input.subject, text: input.text }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? 'Failed to send');
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
