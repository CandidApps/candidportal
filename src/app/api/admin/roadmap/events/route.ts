import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ROADMAP_EVENT_TYPES, type RoadmapEventType } from '@/lib/services/product-roadmap';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as {
    event_type?: string;
    summary?: string;
    item_id?: string | null;
  };

  const summary = body.summary?.trim();
  if (!summary) return NextResponse.json({ error: 'summary is required' }, { status: 400 });

  const eventType = (body.event_type ?? 'note') as RoadmapEventType;
  if (!(ROADMAP_EVENT_TYPES as readonly string[]).includes(eventType)) {
    return NextResponse.json({ error: 'invalid event_type' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('product_roadmap_events')
    .insert({
      item_id: body.item_id?.trim() || null,
      event_type: eventType,
      summary,
      actor_email: user?.email ?? null,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data });
}
