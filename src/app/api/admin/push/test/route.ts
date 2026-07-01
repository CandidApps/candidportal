import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { isPushConfigured, sendAdminTestPush } from '@/lib/notifications/push';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function currentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Sends a test push to the caller's registered devices. */
export async function POST() {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isPushConfigured()) {
    return NextResponse.json({ error: 'Push is not configured on the server.' }, { status: 409 });
  }
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await sendAdminTestPush(userId, {
    title: 'Candid test notification',
    body: 'Push notifications are working on this device.',
    url: '/admin',
    tag: 'candid-test-push',
  });

  if (result.skipped === 'no_subscriptions') {
    return NextResponse.json(
      {
        error:
          'No push subscription for this account on this browser. Open Settings → Enable push on this device, then try again.',
        ...result,
      },
      { status: 409 },
    );
  }

  if (result.sent === 0) {
    return NextResponse.json(
      {
        error: result.skipped === 'not_configured' ? 'Push is not configured.' : 'Push could not be delivered.',
        ...result,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, ...result });
}
