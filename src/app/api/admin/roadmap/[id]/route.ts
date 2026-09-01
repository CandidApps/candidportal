import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  ROADMAP_KINDS,
  ROADMAP_STATUSES,
  itemSnapshot,
  mapRoadmapItem,
  type RoadmapItem,
  type RoadmapItemPatch,
  type RoadmapKind,
  type RoadmapStatus,
} from '@/lib/services/product-roadmap';

export const dynamic = 'force-dynamic';

async function actorEmail(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? null;
}

function isKind(v: unknown): v is RoadmapKind {
  return typeof v === 'string' && (ROADMAP_KINDS as readonly string[]).includes(v);
}

function isStatus(v: unknown): v is RoadmapStatus {
  return typeof v === 'string' && (ROADMAP_STATUSES as readonly string[]).includes(v);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as RoadmapItemPatch;
  const admin = createSupabaseAdminClient();
  const email = await actorEmail();

  const { data: existing, error: readErr } = await admin
    .from('product_roadmap_items')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const before = mapRoadmapItem(existing as Record<string, unknown>);
  const update: Record<string, unknown> = {};

  if (body.title !== undefined) update.title = body.title.trim();
  if (body.description !== undefined) update.description = body.description.trim();
  if (body.owner !== undefined) update.owner = body.owner.trim();
  if (body.phase !== undefined) update.phase = body.phase.trim();
  if (body.app_area !== undefined) update.app_area = body.app_area.trim();
  if (body.sort_order !== undefined) update.sort_order = Number(body.sort_order) || 0;
  if (body.target_date !== undefined) update.target_date = body.target_date?.trim() || null;
  if (body.parent_id !== undefined) update.parent_id = body.parent_id?.trim() || null;
  if (body.kind !== undefined) {
    if (!isKind(body.kind)) return NextResponse.json({ error: 'invalid kind' }, { status: 400 });
    update.kind = body.kind;
  }
  if (body.status !== undefined) {
    if (!isStatus(body.status)) return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    update.status = body.status;
  }

  if (Object.keys(update).length === 0 && !body.path_change_note?.trim()) {
    return NextResponse.json({ item: before });
  }

  let item: RoadmapItem = before;
  if (Object.keys(update).length > 0) {
    const { data, error } = await admin
      .from('product_roadmap_items')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    item = mapRoadmapItem(data as Record<string, unknown>);
  }

  const events: Array<Record<string, unknown>> = [];

  if (body.status && body.status !== before.status) {
    events.push({
      item_id: id,
      event_type: 'status_changed',
      summary: `${before.title}: ${before.status} → ${body.status}`,
      before_state: itemSnapshot(before),
      after_state: itemSnapshot(item),
      actor_email: email,
    });
  } else if (body.owner !== undefined && body.owner.trim() !== before.owner) {
    events.push({
      item_id: id,
      event_type: 'reassigned',
      summary: `${before.title}: owner ${before.owner || '—'} → ${body.owner.trim() || '—'}`,
      before_state: itemSnapshot(before),
      after_state: itemSnapshot(item),
      actor_email: email,
    });
  } else if (Object.keys(update).length > 0) {
    events.push({
      item_id: id,
      event_type: 'updated',
      summary: `Updated ${item.kind}: ${item.title}`,
      before_state: itemSnapshot(before),
      after_state: itemSnapshot(item),
      actor_email: email,
    });
  }

  if (body.path_change_note?.trim()) {
    events.push({
      item_id: id,
      event_type: 'path_change',
      summary: body.path_change_note.trim(),
      before_state: itemSnapshot(before),
      after_state: itemSnapshot(item),
      actor_email: email,
    });
  }

  if (events.length) {
    await admin.from('product_roadmap_events').insert(events);
  }

  return NextResponse.json({ item });
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
    .from('product_roadmap_items')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const before = mapRoadmapItem(existing as Record<string, unknown>);

  await admin.from('product_roadmap_events').insert({
    item_id: null,
    event_type: 'deleted',
    summary: `Deleted ${before.kind}: ${before.title}`,
    before_state: itemSnapshot(before),
    actor_email: email,
  });

  const { error } = await admin.from('product_roadmap_items').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
