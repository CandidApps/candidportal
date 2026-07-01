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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = (await request.json()) as Partial<{
    title: string;
    notes: string | null;
    notesHtml: string | null;
    priority: AssistantTask['priority'];
    status: AssistantTask['status'];
    dueDate: string | null;
    dueAt: string | null;
    ownerId: string;
    sourceMeta: Record<string, unknown> | null;
  }>;

  const admin = createSupabaseAdminClient();

  if (body.dueAt !== undefined || body.dueDate !== undefined) {
    const { data: current } = await admin
      .from('assistant_tasks')
      .select('due_at, original_due_at')
      .eq('id', id)
      .maybeSingle();
    const nextDueAt =
      body.dueAt !== undefined
        ? body.dueAt
        : body.dueDate
          ? `${body.dueDate}T12:00:00.000Z`
          : null;
    if (current?.due_at && nextDueAt && current.due_at !== nextDueAt && !current.original_due_at) {
      body.dueAt = nextDueAt;
      // original_due_at set below in updates
    }
  }

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title.trim();
  if (body.notesHtml !== undefined) {
    updates.notes_html = body.notesHtml?.trim() || null;
    updates.notes = body.notesHtml ? richHtmlToPlainText(body.notesHtml) : null;
  } else if (body.notes !== undefined) {
    updates.notes = body.notes?.trim() || null;
  }
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.dueAt !== undefined) {
    const nextDueAt = body.dueAt || null;
    const { data: current } = await admin
      .from('assistant_tasks')
      .select('due_at, original_due_at')
      .eq('id', id)
      .maybeSingle();
    if (current?.due_at && nextDueAt && current.due_at !== nextDueAt && !current.original_due_at) {
      updates.original_due_at = current.due_at;
    }
    updates.due_at = nextDueAt;
    updates.due_date = dueDateFromAt(nextDueAt);
  } else if (body.dueDate !== undefined) {
    const nextDueAt = body.dueDate ? `${body.dueDate}T12:00:00.000Z` : null;
    const { data: current } = await admin
      .from('assistant_tasks')
      .select('due_at, original_due_at')
      .eq('id', id)
      .maybeSingle();
    if (current?.due_at && nextDueAt && current.due_at !== nextDueAt && !current.original_due_at) {
      updates.original_due_at = current.due_at;
    }
    updates.due_at = nextDueAt;
    updates.due_date = body.dueDate || null;
  }
  if (body.ownerId !== undefined) updates.owner_id = body.ownerId;
  if (body.sourceMeta !== undefined) updates.source_meta = body.sourceMeta;
  if (body.status !== undefined) {
    updates.status = body.status;
    updates.completed_at = body.status === 'done' ? new Date().toISOString() : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No changes' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('assistant_tasks')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 });
  }

  const members = await listAdminTeamMembers(admin);
  const memberMap = new Map(members.map((m) => [m.id, m]));
  return NextResponse.json({
    task: mapTaskRow(data as Record<string, unknown>, memberMap, userId),
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('assistant_tasks').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
