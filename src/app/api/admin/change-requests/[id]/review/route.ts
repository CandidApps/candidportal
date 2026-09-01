import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  BLAST_RADII,
  CHANGE_DISPOSITIONS,
  changeSnapshot,
  mapChangeRequest,
  mapChangeReview,
  resolveChangeStatusFromReviews,
  type BlastRadius,
  type ChangeDisposition,
} from '@/lib/services/product-change-requests';

export const dynamic = 'force-dynamic';

function isDisposition(v: unknown): v is ChangeDisposition {
  return typeof v === 'string' && (CHANGE_DISPOSITIONS as readonly string[]).includes(v);
}
function isBlast(v: unknown): v is BlastRadius {
  return typeof v === 'string' && (BLAST_RADII as readonly string[]).includes(v);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as {
    disposition?: string;
    comment?: string;
    risks?: string;
    must_preserve?: string;
    blast_radius?: string;
  };

  if (!isDisposition(body.disposition)) {
    return NextResponse.json({ error: 'invalid disposition' }, { status: 400 });
  }
  if (body.blast_radius && !isBlast(body.blast_radius)) {
    return NextResponse.json({ error: 'invalid blast_radius' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? 'unknown';

  const admin = createSupabaseAdminClient();
  const { data: existing, error: readErr } = await admin
    .from('product_change_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const before = mapChangeRequest(existing as Record<string, unknown>);

  const { data: reviewRow, error: revErr } = await admin
    .from('product_change_reviews')
    .insert({
      change_request_id: id,
      reviewer_email: email,
      disposition: body.disposition,
      comment: body.comment?.trim() ?? '',
      risks: body.risks?.trim() ?? '',
      must_preserve: body.must_preserve?.trim() ?? '',
      blast_radius: body.blast_radius ?? 'local',
    })
    .select('*')
    .single();

  if (revErr) return NextResponse.json({ error: revErr.message }, { status: 500 });

  const { data: allReviews, error: listErr } = await admin
    .from('product_change_reviews')
    .select('*')
    .eq('change_request_id', id)
    .order('created_at', { ascending: true });
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

  const reviewRows = (allReviews ?? []).map((r) => mapChangeReview(r as Record<string, unknown>));
  const newStatus = resolveChangeStatusFromReviews(before.reviewers, reviewRows);

  const { data: updated, error: updErr } = await admin
    .from('product_change_requests')
    .update({ status: newStatus })
    .eq('id', id)
    .select('*')
    .single();

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  const change = mapChangeRequest(updated as Record<string, unknown>);
  const review = mapChangeReview(reviewRow as Record<string, unknown>);

  await admin.from('product_change_events').insert({
    change_request_id: id,
    event_type: 'reviewed',
    summary: `${change.public_id} reviewed → ${newStatus} by ${email}`,
    before_state: changeSnapshot(before),
    after_state: changeSnapshot(change),
    actor_email: email,
  });

  return NextResponse.json({ change, review });
}
