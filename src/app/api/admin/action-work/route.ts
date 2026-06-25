import { NextResponse } from 'next/server';
import {
  buildActionKey,
  type ActionAssignee,
  type ActionWorkState,
  type TeamMember,
} from '@/lib/admin-action-work';
import { listAdminTeamMembersMap } from '@/lib/admin-team-members';
import type { AdminTicketKind } from '@/lib/admin-tickets';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function latestIso(...values: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestTime = -Infinity;
  for (const value of values) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (!Number.isNaN(time) && time > bestTime) {
      bestTime = time;
      best = value;
    }
  }
  return best;
}

function mapWorkRows(
  workRows: Record<string, unknown>[],
  assigneeRows: Record<string, unknown>[],
  members: Map<string, TeamMember>,
): ActionWorkState[] {
  const assigneesByKey = new Map<string, ActionAssignee[]>();
  const activityByKey = new Map<string, string | null>();

  for (const row of assigneeRows) {
    const key = String(row.action_key);
    const userId = String(row.user_id);
    const assignedById = (row.assigned_by as string | null) ?? null;
    const claimedAt = (row.claimed_at as string | null) ?? null;
    const member = members.get(userId);
    const assignee: ActionAssignee = {
      userId,
      name: member?.email ?? member?.displayName ?? 'Team member',
      assignedById,
      assignedByOther: Boolean(assignedById && assignedById !== userId),
      claimed: Boolean(claimedAt),
      claimedAt,
    };
    const list = assigneesByKey.get(key) ?? [];
    list.push(assignee);
    assigneesByKey.set(key, list);
    activityByKey.set(
      key,
      latestIso(activityByKey.get(key), claimedAt, row.assigned_at as string | null),
    );
  }

  return workRows.map((row) => {
    const actionKey = String(row.action_key);
    const assignees = assigneesByKey.get(actionKey) ?? [];
    const claimers = assignees.filter((a) => a.claimed);
    return {
      actionKey,
      actionKind: row.action_kind as AdminTicketKind,
      sourceId: String(row.source_id),
      assignees,
      assigneeIds: assignees.map((a) => a.userId),
      assigneeNames: assignees.map((a) => a.name),
      claimerIds: claimers.map((a) => a.userId),
      claimerNames: claimers.map((a) => a.name),
      lastActivityAt: latestIso(
        activityByKey.get(actionKey),
        row.updated_at as string | null,
        row.created_at as string | null,
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
  const members = await listAdminTeamMembersMap(admin);

  const { data: workRows, error: workError } = await admin.from('admin_action_work').select('*');
  if (workError) {
    return NextResponse.json({ error: workError.message }, { status: 500 });
  }

  const { data: assigneeRows, error: assigneeError } = await admin
    .from('admin_action_assignees')
    .select('action_key, user_id, assigned_by, assigned_at, claimed_at');
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
    op?: 'claim' | 'assign' | 'remove';
    userId?: string;
  };

  if (!body.actionKind || !body.sourceId || !body.op) {
    return NextResponse.json({ error: 'Missing actionKind, sourceId, or op' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const actionKey = buildActionKey(body.actionKind, body.sourceId);
  const now = new Date().toISOString();

  // Ensure the parent work row exists (assignees FK to it) and bump activity.
  const { data: existing } = await admin
    .from('admin_action_work')
    .select('action_key')
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
  } else {
    await admin
      .from('admin_action_work')
      .update({ source_id: body.sourceId })
      .eq('action_key', actionKey);
  }

  if (body.op === 'claim') {
    // Current user marks themselves as actively working. Creates a self-assigned
    // row if none exists, otherwise accepts an existing (assigned-by-other) row
    // WITHOUT clobbering the original assigner (so reject still needs a note).
    const { data: mine } = await admin
      .from('admin_action_assignees')
      .select('user_id')
      .eq('action_key', actionKey)
      .eq('user_id', user.id)
      .maybeSingle();

    if (mine) {
      const { error } = await admin
        .from('admin_action_assignees')
        .update({ claimed_at: now })
        .eq('action_key', actionKey)
        .eq('user_id', user.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await admin.from('admin_action_assignees').insert({
        action_key: actionKey,
        user_id: user.id,
        assigned_by: user.id,
        assigned_at: now,
        claimed_at: now,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else if (body.op === 'assign') {
    if (!body.userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }
    const { data: already } = await admin
      .from('admin_action_assignees')
      .select('user_id')
      .eq('action_key', actionKey)
      .eq('user_id', body.userId)
      .maybeSingle();
    if (!already) {
      const claimedAt = body.userId === user.id ? now : null;
      const { error } = await admin.from('admin_action_assignees').insert({
        action_key: actionKey,
        user_id: body.userId,
        assigned_by: user.id,
        assigned_at: now,
        claimed_at: claimedAt,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else if (body.op === 'remove') {
    if (!body.userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }
    const { error } = await admin
      .from('admin_action_assignees')
      .delete()
      .eq('action_key', actionKey)
      .eq('user_id', body.userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    return NextResponse.json({ error: 'Unknown op' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
