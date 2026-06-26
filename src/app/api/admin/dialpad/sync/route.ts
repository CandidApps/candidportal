import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { syncDialpadCalls } from '@/lib/dialpad/sync';
import { diagnoseCalls, isDialpadConfigured, listCompanyUsers } from '@/lib/dialpad/client';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const days = Number(new URL(request.url).searchParams.get('days') ?? '14') || 14;
  const result = await syncDialpadCalls(Math.min(Math.max(days, 1), 90));
  return NextResponse.json(result);
}

/**
 * Diagnostic endpoint. Open in the browser while logged in as an admin:
 *   /api/admin/dialpad/sync           -> connectivity + company-wide probe
 *   /api/admin/dialpad/sync?days=2    -> widen the lookback window
 * Reports raw Dialpad HTTP status/counts so we can see why calls aren't syncing.
 */
export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const days = Number(new URL(request.url).searchParams.get('days') ?? '2') || 2;
  const startedAfterMs = Date.now() - Math.min(Math.max(days, 1), 90) * 86_400_000;

  if (!isDialpadConfigured()) {
    return NextResponse.json({ configured: false, hint: 'DIALPAD_API_KEY is not set on this deployment.' });
  }

  const companyWide = await diagnoseCalls({ startedAfterMs });

  // Probe the first user too, since the list endpoint is often target-scoped.
  let users: { id: string; name: string | null }[] = [];
  let usersError: string | undefined;
  let perUser: Awaited<ReturnType<typeof diagnoseCalls>> | undefined;
  try {
    const list = await listCompanyUsers(5);
    users = list.map((u) => ({ id: u.id, name: u.name }));
    if (list[0]) {
      perUser = await diagnoseCalls({ startedAfterMs, targetId: list[0].id, targetType: 'user' });
    }
  } catch (e) {
    usersError = e instanceof Error ? e.message : 'users fetch failed';
  }

  return NextResponse.json({
    configured: true,
    lookbackDays: Math.min(Math.max(days, 1), 90),
    companyWide,
    usersFound: users.length,
    sampleUsers: users,
    usersError,
    perUserProbe: perUser,
  });
}
