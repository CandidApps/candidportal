import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { listAdminTeamMembers } from '@/lib/admin-team-members';
import { renderNoteBody } from '@/lib/admin-action-work';
import { loadActions, loadCalendar, loadEmailAndRecaps } from '@/lib/assistant/data';
import type { AssistantMention, AssistantOverview } from '@/lib/assistant/types';

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

  const calendar = await loadCalendar(userId);
  const [emailResult, actions, mentions] = await Promise.all([
    loadEmailAndRecaps(userId, calendar.events),
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
