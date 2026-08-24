import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const DEFAULT_FLAGS = { welcomeSeen: false, analysisUnlocked: false };

function isMissingColumnError(message: string): boolean {
  return /welcome_seen_at|analysis_unlocked_at|does not exist|Could not find/i.test(message);
}

/** Member profile onboarding flags (server-side; avoids RLS / schema cache issues). */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('welcome_seen_at, analysis_unlocked_at')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error.message)) {
      return NextResponse.json(DEFAULT_FLAGS);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    welcomeSeen: Boolean(data?.welcome_seen_at),
    analysisUnlocked: Boolean(data?.analysis_unlocked_at),
  });
}

/** Mark welcome modal dismissed for the signed-in member. */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from('profiles')
    .update({ welcome_seen_at: now })
    .eq('id', user.id);

  if (error) {
    if (isMissingColumnError(error.message)) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, welcomeSeenAt: now });
}

/** Unlock full analysis view for the signed-in member. */
export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { analysisUnlocked?: boolean } = {};
  try {
    body = (await request.json()) as { analysisUnlocked?: boolean };
  } catch {
    body = {};
  }
  if (!body.analysisUnlocked) {
    return NextResponse.json({ error: 'analysisUnlocked required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from('profiles')
    .update({ analysis_unlocked_at: now })
    .eq('id', user.id);

  if (error) {
    if (isMissingColumnError(error.message)) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, analysisUnlockedAt: now });
}
