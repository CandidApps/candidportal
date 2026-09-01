import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  ROADMAP_KINDS,
  ROADMAP_STATUSES,
  itemSnapshot,
  mapRoadmapEvent,
  mapRoadmapItem,
  type RoadmapItem,
  type RoadmapItemInput,
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

export async function GET() {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: items, error } = await admin
    .from('product_roadmap_items')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    if (/product_roadmap_items|schema cache|does not exist/i.test(error.message)) {
      return NextResponse.json({
        items: [],
        events: [],
        migrationRequired: true,
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: events, error: evErr } = await admin
    .from('product_roadmap_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (evErr && !/product_roadmap_events|schema cache|does not exist/i.test(evErr.message)) {
    return NextResponse.json({ error: evErr.message }, { status: 500 });
  }

  return NextResponse.json({
    items: (items ?? []).map((r) => mapRoadmapItem(r as Record<string, unknown>)),
    events: (events ?? []).map((r) => mapRoadmapEvent(r as Record<string, unknown>)),
  });
}

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as RoadmapItemInput;
  if (!body.title?.trim() || !isKind(body.kind)) {
    return NextResponse.json({ error: 'title and kind are required' }, { status: 400 });
  }
  if (body.status && !isStatus(body.status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const email = await actorEmail();

  const { data, error } = await admin
    .from('product_roadmap_items')
    .insert({
      parent_id: body.parent_id?.trim() || null,
      kind: body.kind,
      title: body.title.trim(),
      description: body.description?.trim() ?? '',
      status: body.status ?? 'planned',
      owner: body.owner?.trim() ?? '',
      phase: body.phase?.trim() ?? '',
      app_area: body.app_area?.trim() ?? '',
      sort_order: body.sort_order ?? 0,
      target_date: body.target_date?.trim() || null,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const item = mapRoadmapItem(data as Record<string, unknown>);
  await admin.from('product_roadmap_events').insert({
    item_id: item.id,
    event_type: 'created',
    summary: `Created ${item.kind}: ${item.title}`,
    after_state: itemSnapshot(item),
    actor_email: email,
  });

  return NextResponse.json({ item });
}
