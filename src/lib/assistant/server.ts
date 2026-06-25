import 'server-only';
import type { TeamMember } from '@/lib/admin-action-work';
import type { AssistantTask } from '@/lib/assistant/types';

export function mapTaskRow(
  row: Record<string, unknown>,
  members: Map<string, TeamMember>,
  viewerId: string,
): AssistantTask {
  const ownerId = String(row.owner_id);
  const createdBy = String(row.created_by);
  return {
    id: String(row.id),
    ownerId,
    ownerName: members.get(ownerId)?.displayName ?? 'Team member',
    createdBy,
    createdByName: members.get(createdBy)?.displayName ?? 'Team member',
    title: String(row.title),
    notes: (row.notes as string | null) ?? null,
    priority: row.priority as AssistantTask['priority'],
    status: row.status as AssistantTask['status'],
    dueDate: (row.due_date as string | null) ?? null,
    source: String(row.source ?? 'manual'),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    mine: ownerId === viewerId,
  };
}
