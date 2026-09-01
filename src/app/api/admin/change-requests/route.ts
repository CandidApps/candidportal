import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  CHANGE_PRIORITIES,
  CHANGE_STATUSES,
  CHANGE_TYPES,
  CHANGE_USER_ROLES,
  changeSnapshot,
  isImplementationPath,
  mapChangeAttachment,
  mapChangeEvent,
  mapChangeRequest,
  mapChangeReview,
  resolveInitialStatusFromImplementationPath,
  type ChangePriority,
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

export async function GET() {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: rows, error } = await admin
    .from('product_change_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    if (/product_change_requests|schema cache|does not exist/i.test(error.message)) {
      return NextResponse.json({
        changes: [],
        reviews: [],
        events: [],
        attachments: [],
        migrationRequired: true,
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (rows ?? []).map((r) => String((r as { id: string }).id));
  let reviews: ReturnType<typeof mapChangeReview>[] = [];
  let attachments: ReturnType<typeof mapChangeAttachment>[] = [];
  if (ids.length) {
    const { data: reviewRows, error: revErr } = await admin
      .from('product_change_reviews')
      .select('*')
      .in('change_request_id', ids)
      .order('created_at', { ascending: false });
    if (revErr && !/product_change_reviews|schema cache|does not exist/i.test(revErr.message)) {
      return NextResponse.json({ error: revErr.message }, { status: 500 });
    }
    reviews = (reviewRows ?? []).map((r) => mapChangeReview(r as Record<string, unknown>));

    const { data: attRows, error: attErr } = await admin
      .from('product_change_attachments')
      .select('*')
      .in('change_request_id', ids)
      .order('created_at', { ascending: true });
    if (attErr && !/product_change_attachments|schema cache|does not exist/i.test(attErr.message)) {
      return NextResponse.json({ error: attErr.message }, { status: 500 });
    }
    if (!attErr) {
      attachments = await Promise.all(
        (attRows ?? []).map(async (row) => {
          const mapped = mapChangeAttachment(row as Record<string, unknown>);
          const { data: signed } = await admin.storage
            .from('change-request-attachments')
            .createSignedUrl(mapped.storage_path, 60 * 60);
          mapped.url = signed?.signedUrl ?? null;
          return mapped;
        }),
      );
    }
  }

  const { data: events, error: evErr } = await admin
    .from('product_change_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (evErr && !/product_change_events|schema cache|does not exist/i.test(evErr.message)) {
    return NextResponse.json({ error: evErr.message }, { status: 500 });
  }

  return NextResponse.json({
    changes: (rows ?? []).map((r) => mapChangeRequest(r as Record<string, unknown>)),
    reviews,
    events: (events ?? []).map((r) => mapChangeEvent(r as Record<string, unknown>)),
    attachments,
  });
}

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as ChangeRequestInput;
  if (!body.title?.trim() || !isType(body.change_type)) {
    return NextResponse.json({ error: 'title and change_type are required' }, { status: 400 });
  }
  if (body.priority && !isPriority(body.priority)) {
    return NextResponse.json({ error: 'invalid priority' }, { status: 400 });
  }
  if (body.status && !isStatus(body.status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }
  if (body.user_role && !isRole(body.user_role)) {
    return NextResponse.json({ error: 'invalid user_role' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const email = await actorEmail();

  const implementationPath =
    body.implementation_path && isImplementationPath(body.implementation_path)
      ? body.implementation_path
      : 'spec_only';
  if (implementationPath === 'ready_for_pr') {
    return NextResponse.json(
      { error: 'ready_for_pr is only allowed after team acceptance' },
      { status: 400 },
    );
  }

  const status =
    body.status ??
    resolveInitialStatusFromImplementationPath(implementationPath);

  const insertPayload: Record<string, unknown> = {
    title: body.title.trim(),
    change_type: body.change_type,
    priority: body.priority ?? 'p2',
    status,
    screen: body.screen?.trim() ?? '',
    user_role: body.user_role ?? 'both',
    current_behavior: body.current_behavior?.trim() ?? '',
    desired_behavior: body.desired_behavior?.trim() ?? '',
    user_flow_steps: body.user_flow_steps?.trim() ?? '',
    change_solves: body.change_solves?.trim() ?? '',
    acceptance_criteria: body.acceptance_criteria?.trim() ?? '',
    out_of_scope: body.out_of_scope?.trim() ?? '',
    app_areas: body.app_areas?.trim() ?? '',
    related_files: body.related_files?.trim() ?? '',
    data_migration: body.data_migration ?? 'none',
    risk_notes: body.risk_notes?.trim() ?? '',
    demo_impact: body.demo_impact?.trim() ?? '',
    owner: body.owner?.trim() ?? '',
    reviewers: body.reviewers?.trim() ?? '',
    milestone_id: body.milestone_id?.trim() || null,
    implementation_path: implementationPath,
    linked_branch: body.linked_branch?.trim() ?? '',
    created_by_email: email,
  };

  const { data, error } = await admin
    .from('product_change_requests')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const change = mapChangeRequest(data as Record<string, unknown>);
  await admin.from('product_change_events').insert({
    change_request_id: change.id,
    event_type: 'created',
    summary: `Created ${change.public_id}: ${change.title}`,
    after_state: changeSnapshot(change),
    actor_email: email,
  });

  return NextResponse.json({ change });
}
