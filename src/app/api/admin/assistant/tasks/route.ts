import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { listAdminTeamMembers } from '@/lib/admin-team-members';
import { mapTaskRow } from '@/lib/assistant/server';
import type { AssistantTask } from '@/lib/assistant/types';
import { richHtmlToPlainText } from '@/lib/rich-text';

export const dynamic = 'force-dynamic';

async function currentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function dueDateFromAt(dueAt: string | null | undefined): string | null {
  if (!dueAt) return null;
  return dueAt.slice(0, 10);
}

export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scope = new URL(request.url).searchParams.get('scope') ?? 'mine';
  const admin = createSupabaseAdminClient();

  let query = admin
    .from('assistant_tasks')
    .select('*')
    .order('status', { ascending: true })
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200);

  if (scope === 'mine') {
    query = query.or(`owner_id.eq.${userId},created_by.eq.${userId}`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const members = await listAdminTeamMembers(admin);
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const tasks = (data ?? []).map((row) =>
    mapTaskRow(row as Record<string, unknown>, memberMap, userId),
  );
  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as {
    title?: string;
    notes?: string;
    notesHtml?: string | null;
    priority?: AssistantTask['priority'];
    dueDate?: string | null;
    dueAt?: string | null;
    ownerId?: string;
    source?: string;
    sourceRef?: string;
    sourceMeta?: Record<string, unknown> | null;
  };

  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });

  const dueAt = body.dueAt ?? (body.dueDate ? `${body.dueDate}T12:00:00.000Z` : null);
  const notesHtml = body.notesHtml?.trim() || null;
  const notes = body.notes?.trim() || (notesHtml ? richHtmlToPlainText(notesHtml) : null) || null;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('assistant_tasks')
    .insert({
      owner_id: body.ownerId || userId,
      created_by: userId,
      title,
      notes,
      notes_html: notesHtml,
      priority: body.priority ?? 'normal',
      due_date: dueDateFromAt(dueAt),
      due_at: dueAt,
      source: body.source ?? 'manual',
      source_ref: body.sourceRef ?? null,
      source_meta: body.sourceMeta ?? null,
    })
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
  }

  const members = await listAdminTeamMembers(admin);
  const memberMap = new Map(members.map((m) => [m.id, m]));
  return NextResponse.json({
    task: mapTaskRow(data as Record<string, unknown>, memberMap, userId),
  });
}
