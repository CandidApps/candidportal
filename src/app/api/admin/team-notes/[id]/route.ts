import { NextResponse } from 'next/server';
import {
  loadTeamNoteMembers,
  mapTeamNoteRow,
  notifyTeamNoteMentions,
  resolveNoteMentions,
} from '@/lib/team-notes-server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
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

  const { id } = await context.params;
  const body = (await request.json()) as { body?: string };
  const text = body.body?.trim();
  if (!id || !text) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: existing, error: loadError } = await admin
    .from('team_notes')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (loadError || !existing) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  }
  if (String(existing.author_id) !== user.id) {
    return NextResponse.json({ error: 'You can only edit your own notes' }, { status: 403 });
  }

  const members = await loadTeamNoteMembers(admin);
  const mentionUserIds = resolveNoteMentions(text, members, user.id);

  const { data, error } = await admin
    .from('team_notes')
    .update({
      body: text,
      mention_user_ids: mentionUserIds,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 });
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

export async function DELETE(_request: Request, context: RouteContext) {
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

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: existing, error: loadError } = await admin
    .from('team_notes')
    .select('id, author_id')
    .eq('id', id)
    .maybeSingle();

  if (loadError || !existing) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  }
  if (String(existing.author_id) !== user.id) {
    return NextResponse.json({ error: 'You can only delete your own notes' }, { status: 403 });
  }

  const { error } = await admin.from('team_notes').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
