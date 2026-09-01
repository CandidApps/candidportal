import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { syncLinkedRoadmapItemFromChange } from '@/lib/crm/change-roadmap-sync';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  CHANGE_PRIORITIES,
  CHANGE_STATUSES,
  CHANGE_TYPES,
  CHANGE_USER_ROLES,
  canSetReadyForPr,
  changeSnapshot,
  isImplementationPath,
  mapChangeRequest,
  mapChangeReview,
  type ChangePriority,
  type ChangeRequest,
  type ChangeRequestInput,
  type ChangeStatus,
  type ChangeType,
  type ChangeUserRole,
} from '@/lib/services/product-change-requests';

export const dynamic = 'force-dynamic';

async function actorEmail(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? null;
}

function isType(v: unknown): v is ChangeType {
  return typeof v === 'string' && (CHANGE_TYPES as readonly string[]).includes(v);
}
function isPriority(v: unknown): v is ChangePriority {
  return typeof v === 'string' && (CHANGE_PRIORITIES as readonly string[]).includes(v);
}
function isStatus(v: unknown): v is ChangeStatus {
  return typeof v === 'string' && (CHANGE_STATUSES as readonly string[]).includes(v);
}
function isRole(v: unknown): v is ChangeUserRole {
  return typeof v === 'string' && (CHANGE_USER_ROLES as readonly string[]).includes(v);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('product_change_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: reviews } = await admin
    .from('product_change_reviews')
    .select('*')
    .eq('change_request_id', id)
    .order('created_at', { ascending: false });

  return NextResponse.json({
    change: mapChangeRequest(data as Record<string, unknown>),
    reviews: (reviews ?? []).map((r) => mapChangeReview(r as Record<string, unknown>)),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as Partial<ChangeRequestInput> & { status?: ChangeStatus };
  const admin = createSupabaseAdminClient();
  const email = await actorEmail();

  const { data: existing, error: readErr } = await admin
    .from('product_change_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const before = mapChangeRequest(existing as Record<string, unknown>);
  const update: Record<string, unknown> = {};

  if (body.title !== undefined) update.title = body.title.trim();
  if (body.change_type !== undefined) {
    if (!isType(body.change_type)) return NextResponse.json({ error: 'invalid change_type' }, { status: 400 });
    update.change_type = body.change_type;
  }
  if (body.priority !== undefined) {
    if (!isPriority(body.priority)) return NextResponse.json({ error: 'invalid priority' }, { status: 400 });
    update.priority = body.priority;
  }
  if (body.status !== undefined) {
    if (!isStatus(body.status)) return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    update.status = body.status;
  }
  if (body.user_role !== undefined) {
    if (!isRole(body.user_role)) return NextResponse.json({ error: 'invalid user_role' }, { status: 400 });
    update.user_role = body.user_role;
  }
  if (body.screen !== undefined) update.screen = body.screen.trim();
  if (body.current_behavior !== undefined) update.current_behavior = body.current_behavior.trim();
  if (body.desired_behavior !== undefined) update.desired_behavior = body.desired_behavior.trim();
  if (body.user_flow_steps !== undefined) update.user_flow_steps = body.user_flow_steps.trim();
  if (body.change_solves !== undefined) update.change_solves = body.change_solves.trim();
  if (body.acceptance_criteria !== undefined) update.acceptance_criteria = body.acceptance_criteria.trim();
  if (body.out_of_scope !== undefined) update.out_of_scope = body.out_of_scope.trim();
  if (body.app_areas !== undefined) update.app_areas = body.app_areas.trim();
  if (body.related_files !== undefined) update.related_files = body.related_files.trim();
  if (body.data_migration !== undefined) update.data_migration = body.data_migration;
  if (body.risk_notes !== undefined) update.risk_notes = body.risk_notes.trim();
  if (body.demo_impact !== undefined) update.demo_impact = body.demo_impact.trim();
  if (body.owner !== undefined) update.owner = body.owner.trim();
  if (body.reviewers !== undefined) update.reviewers = body.reviewers.trim();
  if (body.milestone_id !== undefined) update.milestone_id = body.milestone_id?.trim() || null;

  if (body.implementation_path !== undefined) {
    if (!isImplementationPath(body.implementation_path)) {
      return NextResponse.json({ error: 'invalid implementation_path' }, { status: 400 });
    }
    if (body.implementation_path === 'ready_for_pr' && !canSetReadyForPr(before.status)) {
      return NextResponse.json(
        { error: 'ready_for_pr requires status accepted_ready or in_progress' },
        { status: 400 },
      );
    }
    update.implementation_path = body.implementation_path;
    if (
      body.implementation_path === 'local_verified' &&
      before.status === 'draft' &&
      body.status === undefined
    ) {
      update.status = 'in_review';
    }
  }
  if (body.linked_branch !== undefined) update.linked_branch = body.linked_branch.trim();
  if (body.linked_pr_url !== undefined) update.linked_pr_url = body.linked_pr_url.trim();
  if (body.last_verification_at !== undefined) {
    update.last_verification_at = body.last_verification_at;
  }
  if (body.last_verification_summary !== undefined) {
    update.last_verification_summary = body.last_verification_summary.trim();
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ change: before });
  }

  const { data, error } = await admin
    .from('product_change_requests')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const change: ChangeRequest = mapChangeRequest(data as Record<string, unknown>);
  const eventType =
    body.status && body.status !== before.status ? 'status_changed' : 'updated';
  const summary =
    eventType === 'status_changed'
      ? `${change.public_id}: ${before.status} → ${change.status}`
      : `Updated ${change.public_id}: ${change.title}`;

  await admin.from('product_change_events').insert({
    change_request_id: id,
    event_type: eventType,
    summary,
    before_state: changeSnapshot(before),
    after_state: changeSnapshot(change),
    actor_email: email,
  });

  if (body.status !== undefined && body.status !== before.status) {
    await syncLinkedRoadmapItemFromChange(
      admin,
      change.milestone_id,
      change.status,
      change.public_id,
      email,
    );
  }

  return NextResponse.json({ change });
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
  const email = await actorEmail();

  const { data: existing } = await admin
    .from('product_change_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const before = mapChangeRequest(existing as Record<string, unknown>);

  await admin.from('product_change_events').insert({
    change_request_id: null,
    event_type: 'deleted',
    summary: `Deleted ${before.public_id}: ${before.title}`,
    before_state: changeSnapshot(before),
    actor_email: email,
  });

  const { error } = await admin.from('product_change_requests').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
