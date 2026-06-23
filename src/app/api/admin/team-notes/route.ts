import { NextResponse } from 'next/server';
import { resolveMentionUserIds, type TeamMember } from '@/lib/admin-action-work';
import { listAdminTeamMembers } from '@/lib/admin-team-members';
import type { TeamNoteContextType, TeamNoteRecord } from '@/lib/team-notes';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

async function loadTeamMembers(admin: ReturnType<typeof createSupabaseAdminClient>): Promise<TeamMember[]> {
  return listAdminTeamMembers(admin);
}

function mapNoteRow(
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
    createdAt: String(row.created_at),
  };
}

export async function GET(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const contextType = searchParams.get('contextType') as TeamNoteContextType | null;
  const contextKey = searchParams.get('contextKey');
  if (!contextType || !contextKey) {
    return NextResponse.json({ error: 'Missing contextType or contextKey' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const members = await loadTeamMembers(admin);
  const memberById = new Map(members.map((m) => [m.id, m]));

  const { data, error } = await admin
    .from('team_notes')
    .select('*')
    .eq('context_type', contextType)
    .eq('context_key', contextKey)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const notes = (data ?? []).map((row) => {
    const author = memberById.get(String(row.author_id));
    return mapNoteRow(row as Record<string, unknown>, author?.displayName ?? 'Team member');
  });

  return NextResponse.json({ notes });
}

export async function POST(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as {
    contextType?: TeamNoteContextType;
    contextKey?: string;
    body?: string;
  };

  const text = body.body?.trim();
  if (!body.contextType || !body.contextKey || !text) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const members = await loadTeamMembers(admin);
  const mentionUserIds = resolveMentionUserIds(text, members).filter((id) => id !== user.id);

  const { data, error } = await admin
    .from('team_notes')
    .insert({
      context_type: body.contextType,
      context_key: body.contextKey,
      author_id: user.id,
      body: text,
      mention_user_ids: mentionUserIds,
    })
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
  }

  if (mentionUserIds.length) {
    const notifications = mentionUserIds.map((userId) => ({
      note_id: data.id,
      user_id: userId,
    }));
    await admin.from('team_mention_notifications').insert(notifications);
  }

  const author = members.find((m) => m.id === user.id);
  return NextResponse.json({
    note: mapNoteRow(data as Record<string, unknown>, author?.displayName ?? 'You'),
  });
}
