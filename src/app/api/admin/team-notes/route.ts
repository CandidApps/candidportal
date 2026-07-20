import { NextResponse } from 'next/server';
import type { TeamNoteContextType } from '@/lib/team-notes';
import {
  loadTeamNoteMembers,
  mapTeamNoteRow,
  notifyTeamNoteMentions,
  resolveNoteMentions,
} from '@/lib/team-notes-server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { searchParams } = new URL(request.url);
  const contextType = searchParams.get('contextType') as TeamNoteContextType | null;
  const contextKey = searchParams.get('contextKey');
  if (!contextType || !contextKey) {
    return NextResponse.json({ error: 'Missing contextType or contextKey' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const members = await loadTeamNoteMembers(admin);
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
    return mapTeamNoteRow(row as Record<string, unknown>, author?.displayName ?? 'Team member');
  });

  return NextResponse.json({ notes, currentUserId: user?.id ?? null });
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
    parentNoteId?: string | null;
  };

  const text = body.body?.trim();
  if (!body.contextType || !body.contextKey || !text) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const members = await loadTeamNoteMembers(admin);
  const mentionUserIds = resolveNoteMentions(text, members, user.id);

  let parentNoteId: string | null = body.parentNoteId?.trim() || null;
  if (parentNoteId) {
    const { data: parent, error: parentError } = await admin
      .from('team_notes')
      .select('id, context_type, context_key, parent_note_id')
      .eq('id', parentNoteId)
      .maybeSingle();
    if (parentError || !parent) {
      return NextResponse.json({ error: 'Parent note not found' }, { status: 404 });
    }
    if (parent.context_type !== body.contextType || parent.context_key !== body.contextKey) {
      return NextResponse.json({ error: 'Parent note context mismatch' }, { status: 400 });
    }
    if (parent.parent_note_id) {
      parentNoteId = String(parent.parent_note_id);
    }
  }

  const { data, error } = await admin
    .from('team_notes')
    .insert({
      context_type: body.contextType,
      context_key: body.contextKey,
      author_id: user.id,
      body: text,
      mention_user_ids: mentionUserIds,
      parent_note_id: parentNoteId,
    })
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
  }

  const author = members.find((m) => m.id === user.id);
  const authorName = author?.displayName ?? 'You';
  await notifyTeamNoteMentions({
    admin,
    noteId: data.id,
    authorId: user.id,
    authorName,
    text,
    mentionUserIds,
  });

  return NextResponse.json({
    note: mapTeamNoteRow(data as Record<string, unknown>, authorName),
  });
}
