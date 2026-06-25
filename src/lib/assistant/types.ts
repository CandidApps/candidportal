// Shared types for the MyAssistant admin page + its client fetchers.

export type AssistantCalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  conferenceUrl: string | null;
  attendeeCount: number;
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
    needsAction: AssistantEmailItem[];
    error?: string;
  };
  recaps: AssistantEmailItem[];
  actions: AssistantAction[];
  mentions: AssistantMention[];
  counts: { actions: number; mentions: number; eventsToday: number; emails: number };
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
