export const ROADMAP_KINDS = ['objective', 'milestone', 'task'] as const;
export type RoadmapKind = (typeof ROADMAP_KINDS)[number];

export const ROADMAP_STATUSES = [
  'planned',
  'in_progress',
  'done',
  'blocked',
  'deferred',
  'cancelled',
] as const;
export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];

export const ROADMAP_EVENT_TYPES = [
  'created',
  'updated',
  'status_changed',
  'reassigned',
  'deleted',
  'note',
  'path_change',
  'seeded',
] as const;
export type RoadmapEventType = (typeof ROADMAP_EVENT_TYPES)[number];

export type RoadmapItem = {
  id: string;
  parent_id: string | null;
  kind: RoadmapKind;
  title: string;
  description: string;
  status: RoadmapStatus;
  owner: string;
  phase: string;
  app_area: string;
  sort_order: number;
  target_date: string | null;
  created_at: string;
  updated_at: string;
};

export type RoadmapEvent = {
  id: string;
  item_id: string | null;
  event_type: RoadmapEventType;
  summary: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  actor_email: string | null;
  created_at: string;
};

export type RoadmapItemInput = {
  parent_id?: string | null;
  kind: RoadmapKind;
  title: string;
  description?: string;
  status?: RoadmapStatus;
  owner?: string;
  phase?: string;
  app_area?: string;
  sort_order?: number;
  target_date?: string | null;
};

export type RoadmapItemPatch = Partial<Omit<RoadmapItemInput, 'kind'>> & {
  kind?: RoadmapKind;
  path_change_note?: string;
};

export const ROADMAP_STATUS_LABEL: Record<RoadmapStatus, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  done: 'Done',
  blocked: 'Blocked',
  deferred: 'Deferred',
  cancelled: 'Cancelled',
};

export const ROADMAP_KIND_LABEL: Record<RoadmapKind, string> = {
  objective: 'Objective',
  milestone: 'Milestone',
  task: 'Task',
};

export function mapRoadmapItem(row: Record<string, unknown>): RoadmapItem {
  return {
    id: String(row.id),
    parent_id: (row.parent_id as string | null) ?? null,
    kind: row.kind as RoadmapKind,
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    status: (row.status as RoadmapStatus) ?? 'planned',
    owner: String(row.owner ?? ''),
    phase: String(row.phase ?? ''),
    app_area: String(row.app_area ?? ''),
    sort_order: Number(row.sort_order) || 0,
    target_date: (row.target_date as string | null) ?? null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

export function mapRoadmapEvent(row: Record<string, unknown>): RoadmapEvent {
  return {
    id: String(row.id),
    item_id: (row.item_id as string | null) ?? null,
    event_type: row.event_type as RoadmapEventType,
    summary: String(row.summary ?? ''),
    before_state: (row.before_state as Record<string, unknown> | null) ?? null,
    after_state: (row.after_state as Record<string, unknown> | null) ?? null,
    actor_email: (row.actor_email as string | null) ?? null,
    created_at: String(row.created_at ?? ''),
  };
}

export function itemSnapshot(item: RoadmapItem): Record<string, unknown> {
  return {
    id: item.id,
    parent_id: item.parent_id,
    kind: item.kind,
    title: item.title,
    description: item.description,
    status: item.status,
    owner: item.owner,
    phase: item.phase,
    app_area: item.app_area,
    sort_order: item.sort_order,
    target_date: item.target_date,
  };
}

export async function fetchRoadmapBoard(): Promise<{
  items: RoadmapItem[];
  events: RoadmapEvent[];
  error?: string;
}> {
  const res = await fetch('/api/admin/roadmap', { cache: 'no-store' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { items: [], events: [], error: body?.error ?? 'Failed to load roadmap' };
  }
  const data = (await res.json()) as { items?: RoadmapItem[]; events?: RoadmapEvent[] };
  return { items: data.items ?? [], events: data.events ?? [] };
}

export async function createRoadmapItem(input: RoadmapItemInput): Promise<RoadmapItem | null> {
  const res = await fetch('/api/admin/roadmap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { item?: RoadmapItem };
  return data.item ?? null;
}

export async function patchRoadmapItem(
  id: string,
  patch: RoadmapItemPatch,
): Promise<RoadmapItem | null> {
  const res = await fetch(`/api/admin/roadmap/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { item?: RoadmapItem };
  return data.item ?? null;
}

export async function deleteRoadmapItem(id: string): Promise<boolean> {
  const res = await fetch(`/api/admin/roadmap/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return res.ok;
}

export async function addRoadmapNote(summary: string, itemId?: string | null): Promise<boolean> {
  const res = await fetch('/api/admin/roadmap/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_type: itemId ? 'note' : 'path_change',
      summary,
      item_id: itemId ?? null,
    }),
  });
  return res.ok;
}
