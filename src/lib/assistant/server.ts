import 'server-only';
import type { TeamMember } from '@/lib/admin-action-work';
import type { AssistantTask } from '@/lib/assistant/types';
import { parseTaskSourceMeta } from '@/lib/assistant/task-source';
import { richHtmlToPlainText } from '@/lib/rich-text';

export function mapTaskRow(
  row: Record<string, unknown>,
  members: Map<string, TeamMember>,
  viewerId: string,
): AssistantTask {
  const ownerId = String(row.owner_id);
  const createdBy = String(row.created_by);
  const notesHtml = (row.notes_html as string | null) ?? null;
  const dueAt = (row.due_at as string | null) ?? null;
  const dueDate = (row.due_date as string | null) ?? (dueAt ? dueAt.slice(0, 10) : null);
  return {
    id: String(row.id),
    ownerId,
    ownerName: members.get(ownerId)?.displayName ?? 'Team member',
    createdBy,
    createdByName: members.get(createdBy)?.displayName ?? 'Team member',
    title: String(row.title),
    notes: (row.notes as string | null) ?? (notesHtml ? richHtmlToPlainText(notesHtml) : null),
    notesHtml,
    priority: row.priority as AssistantTask['priority'],
    status: row.status as AssistantTask['status'],
    dueDate,
    dueAt,
    originalDueAt: (row.original_due_at as string | null) ?? null,
    source: String(row.source ?? 'manual'),
    sourceRef: (row.source_ref as string | null) ?? null,
    sourceMeta: parseTaskSourceMeta(row.source_meta),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    mine: ownerId === viewerId,
  };
}
