import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getActiveConnectionForUserOrShared } from '@/lib/email/zoho-connections';
import { scopeHasFreeBusy } from '@/lib/email/zoho';
import { getUserFreeBusy, type FreeBusySlot } from '@/lib/calendar/zoho-calendar';

export const dynamic = 'force-dynamic';

async function currentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export type FreeBusyResult = {
  connected: boolean;
  freebusyScope: boolean;
  /** Busy intervals keyed by attendee email. */
  busyByEmail: Record<string, FreeBusySlot[]>;
  error?: string;
};

/**
 * Returns busy intervals for one or more coworkers/attendees over a window.
 * Query: ?emails=a@x.com,b@y.com&start=ISO&end=ISO
 */
export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const emails = (url.searchParams.get('emails') ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const startRaw = url.searchParams.get('start');
  const endRaw = url.searchParams.get('end');
  const start = startRaw ? new Date(startRaw) : null;
  const end = endRaw ? new Date(endRaw) : null;

  const empty: FreeBusyResult = { connected: false, freebusyScope: false, busyByEmail: {} };
  if (!emails.length || !start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json({ error: 'emails, start, and end are required' }, { status: 400 });
  }

  let conn;
  try {
    conn = await getActiveConnectionForUserOrShared(userId);
  } catch {
    return NextResponse.json(empty);
  }
  if (!conn) return NextResponse.json(empty);
  if (!scopeHasFreeBusy(conn.scope)) {
    return NextResponse.json({ ...empty, connected: true });
  }

  const busyByEmail: Record<string, FreeBusySlot[]> = {};
  await Promise.all(
    emails.map(async (email) => {
      try {
        busyByEmail[email] = await getUserFreeBusy({
          accessToken: conn!.accessToken,
          email,
          start,
          end,
        });
      } catch {
        // Treat an individual lookup failure as "unknown" (no busy data).
        busyByEmail[email] = [];
      }
    }),
  );

  return NextResponse.json({
    connected: true,
    freebusyScope: true,
    busyByEmail,
  } satisfies FreeBusyResult);
}
