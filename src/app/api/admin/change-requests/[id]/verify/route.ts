import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { captureGitWorktreeSnapshot } from '@/lib/services/change-request-git';
import {
  changeSnapshot,
  mapChangeRequest,
  mapChangeReview,
  type ChangeRequest,
} from '@/lib/services/product-change-requests';
import {
  verifyChangeRequestAgainstGit,
  type VerificationResult,
} from '@/lib/services/change-request-verification';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function actorEmail(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { persist?: boolean };
  const persist = body.persist !== false;

  const admin = createSupabaseAdminClient();
  const email = await actorEmail();

  const { data: row, error: readErr } = await admin
    .from('product_change_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const change = mapChangeRequest(row as Record<string, unknown>);

  const { data: reviewRows } = await admin
    .from('product_change_reviews')
    .select('*')
    .eq('change_request_id', id)
    .order('created_at', { ascending: true });

  const reviews = (reviewRows ?? []).map((r) => mapChangeReview(r as Record<string, unknown>));

  const git = await captureGitWorktreeSnapshot();
  const result: VerificationResult = verifyChangeRequestAgainstGit(change, git, reviews);

  let updated: ChangeRequest = change;
  const patch: Record<string, unknown> = {
    last_verification_at: new Date().toISOString(),
    last_verification_summary: result.summary,
  };
  if (!change.linked_branch.trim() && git.branch.trim()) {
    patch.linked_branch = git.branch.trim();
  }

  if (persist) {
    const { data, error } = await admin
      .from('product_change_requests')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    updated = mapChangeRequest(data as Record<string, unknown>);

    await admin.from('product_change_events').insert({
      change_request_id: id,
      event_type: 'verified',
      summary: `${change.public_id} verified → ${result.verdict}`,
      before_state: changeSnapshot(change),
      after_state: changeSnapshot(updated),
      actor_email: email,
    });
  }

  return NextResponse.json({
    ...result,
    change: updated,
    suggestedRelatedFiles: result.suggestedRelatedFiles,
  });
}
