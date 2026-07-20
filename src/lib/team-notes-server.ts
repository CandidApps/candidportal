import { resolveMentionUserIds, type TeamMember } from '@/lib/admin-action-work';
import { listAdminTeamMembers } from '@/lib/admin-team-members';
import type { TeamNoteContextType, TeamNoteRecord } from '@/lib/team-notes';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function loadTeamNoteMembers(
  admin: ReturnType<typeof createSupabaseAdminClient>,
): Promise<TeamMember[]> {
  return listAdminTeamMembers(admin);
}

export function mapTeamNoteRow(
  row: Record<string, unknown>,
  authorName: string,
): TeamNoteRecord {
  return {
    id: String(row.id),
    contextType: row.context_type as TeamNoteContextType,
    contextKey: String(row.context_key),
    authorId: String(row.author_id),
    authorName,
    body: String(row.body),
    mentionUserIds: Array.isArray(row.mention_user_ids)
      ? (row.mention_user_ids as string[])
      : [],
    parentNoteId: row.parent_note_id ? String(row.parent_note_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at ?? row.created_at),
  };
}

export async function notifyTeamNoteMentions(params: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  noteId: string;
  authorId: string;
  authorName: string;
  text: string;
  mentionUserIds: string[];
}): Promise<void> {
  const { admin, noteId, authorId, authorName, text, mentionUserIds } = params;
  const filtered = mentionUserIds.filter((id) => id !== authorId);
  if (!filtered.length) {
    await admin.from('team_mention_notifications').delete().eq('note_id', noteId);
    return;
  }

  await admin.from('team_mention_notifications').delete().eq('note_id', noteId);
  await admin.from('team_mention_notifications').insert(
    filtered.map((userId) => ({ note_id: noteId, user_id: userId })),
  );

  const preview = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  const { sendAdminPush } = await import('@/lib/notifications/push');
  await Promise.all(
    filtered.map((uid) =>
      sendAdminPush(uid, 'mentions', {
        title: `${authorName} mentioned you`,
        body: preview || 'New team note mention',
        url: '/admin',
        tag: `mention-note-${noteId}`,
      }).catch(() => undefined),
    ),
  );
}

export function resolveNoteMentions(text: string, members: TeamMember[], authorId: string): string[] {
  return resolveMentionUserIds(text, members).filter((id) => id !== authorId);
}
