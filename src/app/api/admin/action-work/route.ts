import { NextResponse } from 'next/server';
import {
  buildActionKey,
  type ActionWorkState,
  type TeamMember,
} from '@/lib/admin-action-work';
import { listAdminTeamMembersMap } from '@/lib/admin-team-members';
import type { AdminTicketKind } from '@/lib/admin-tickets';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

async function loadTeamMembers(admin: ReturnType<typeof createSupabaseAdminClient>): Promise<Map<string, TeamMember>> {
  return listAdminTeamMembersMap(admin);
}

function mapWorkRows(
  workRows: Record<string, unknown>[],
  assigneeRows: Record<string, unknown>[],
  members: Map<string, TeamMember>,
): ActionWorkState[] {
  const assigneesByKey = new Map<string, string[]>();
  for (const row of assigneeRows) {
    const key = String(row.action_key);
    const list = assigneesByKey.get(key) ?? [];
    list.push(String(row.user_id));
    assigneesByKey.set(key, list);
  }

  return workRows.map((row) => {
    const actionKey = String(row.action_key);
    const claimedById = (row.claimed_by as string | null) ?? null;
    const assigneeIds = assigneesByKey.get(actionKey) ?? [];
    return {
      actionKey,
      actionKind: row.action_kind as AdminTicketKind,
      sourceId: String(row.source_id),
      claimedById,
      claimedByName: claimedById ? members.get(claimedById)?.displayName ?? null : null,
      claimedAt: (row.claimed_at as string | null) ?? null,
      assigneeIds,
      assigneeNames: assigneeIds.map(
        (id) => members.get(id)?.email ?? members.get(id)?.displayName ?? 'Team member',
      ),
    };
  });
}

export async function GET() {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const members = await loadTeamMembers(admin);

  const { data: workRows, error: workError } = await admin.from('admin_action_work').select('*');
  if (workError) {
    return NextResponse.json({ error: workError.message }, { status: 500 });
  }

  const { data: assigneeRows, error: assigneeError } = await admin
    .from('admin_action_assignees')
    .select('action_key, user_id');
  if (assigneeError) {
    return NextResponse.json({ error: assigneeError.message }, { status: 500 });
  }

  return NextResponse.json({
    work: mapWorkRows(workRows ?? [], assigneeRows ?? [], members),
  });
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
    actionKind?: AdminTicketKind;
    sourceId?: string;
    claim?: boolean | null;
    assigneeIds?: string[];
  };

  if (!body.actionKind || !body.sourceId) {
    return NextResponse.json({ error: 'Missing actionKind or sourceId' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const actionKey = buildActionKey(body.actionKind, body.sourceId);
  const now = new Date().toISOString();

  const { data: existing } = await admin
    .from('admin_action_work')
    .select('action_key, claimed_by')
    .eq('action_key', actionKey)
    .maybeSingle();

  if (!existing) {
    const { error: insertError } = await admin.from('admin_action_work').insert({
      action_key: actionKey,
      action_kind: body.actionKind,
      source_id: body.sourceId,
    });
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  if (body.claim !== undefined) {
    if (body.claim === true) {
      if (existing?.claimed_by && existing.claimed_by !== user.id) {
        return NextResponse.json({ error: 'Already claimed by another teammate' }, { status: 409 });
      }
      const { error } = await admin
        .from('admin_action_work')
        .update({ claimed_by: user.id, claimed_at: now })
        .eq('action_key', actionKey);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const { data: existingAssignees } = await admin
        .from('admin_action_assignees')
        .select('user_id')
        .eq('action_key', actionKey);
      const mergedAssignees = new Set((existingAssignees ?? []).map((row) => String(row.user_id)));
      mergedAssignees.add(user.id);
      for (const id of body.assigneeIds ?? []) mergedAssignees.add(id);
      body.assigneeIds = [...mergedAssignees];
    } else if (body.claim === false || body.claim === null) {
      const { error } = await admin
        .from('admin_action_work')
        .update({ claimed_by: null, claimed_at: null })
        .eq('action_key', actionKey)
        .eq('claimed_by', user.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (body.assigneeIds) {
    await admin.from('admin_action_assignees').delete().eq('action_key', actionKey);
    if (body.assigneeIds.length) {
      const rows = body.assigneeIds.map((userId) => ({
        action_key: actionKey,
        user_id: userId,
        assigned_by: user.id,
        assigned_at: now,
      }));
      const { error } = await admin.from('admin_action_assignees').insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
