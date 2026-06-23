import type { TeamMember } from '@/lib/admin-action-work';

export type TeamNoteContextType = 'action' | 'customer' | 'contact';

export type TeamNoteRecord = {
  id: string;
  contextType: TeamNoteContextType;
  contextKey: string;
  authorId: string;
  authorName: string;
  body: string;
  mentionUserIds: string[];
  createdAt: string;
};

export async function fetchTeamMembers(): Promise<TeamMember[]> {
  const res = await fetch('/api/admin/team-members');
  if (!res.ok) throw new Error('Failed to load team members');
  const json = (await res.json()) as { members?: TeamMember[] };
  return json.members ?? [];
}

export async function fetchTeamNotes(
  contextType: TeamNoteContextType,
  contextKey: string,
): Promise<TeamNoteRecord[]> {
  const params = new URLSearchParams({ contextType, contextKey });
  const res = await fetch(`/api/admin/team-notes?${params}`);
  if (!res.ok) throw new Error('Failed to load team notes');
  const json = (await res.json()) as { notes?: TeamNoteRecord[] };
  return json.notes ?? [];
}

export async function postTeamNote(input: {
  contextType: TeamNoteContextType;
  contextKey: string;
  body: string;
}): Promise<TeamNoteRecord> {
  const res = await fetch('/api/admin/team-notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as { note?: TeamNoteRecord; error?: string };
  if (!res.ok) throw new Error(json.error ?? 'Failed to post note');
  if (!json.note) throw new Error('Failed to post note');
  return json.note;
}

export async function fetchActionWorkMap(): Promise<Record<string, import('@/lib/admin-action-work').ActionWorkState>> {
  const res = await fetch('/api/admin/action-work');
  if (!res.ok) throw new Error('Failed to load action work');
  const json = (await res.json()) as {
    work?: import('@/lib/admin-action-work').ActionWorkState[];
  };
  const map: Record<string, import('@/lib/admin-action-work').ActionWorkState> = {};
  for (const row of json.work ?? []) {
    map[row.actionKey] = row;
  }
  return map;
}

export async function updateActionWork(input: {
  actionKind: string;
  sourceId: string;
  claim?: boolean | null;
  assigneeIds?: string[];
}): Promise<void> {
  const res = await fetch('/api/admin/action-work', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? 'Failed to update action');
}
