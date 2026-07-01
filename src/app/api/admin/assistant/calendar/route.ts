import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  getActiveConnectionForUser,
  getActiveConnectionForUserOrShared,
} from '@/lib/email/zoho-connections';
import { scopeHasCalendar } from '@/lib/email/zoho';
import { createEvent, enrichEventsWithFullDetails, listCalendars, listEventsAllCalendars } from '@/lib/calendar/zoho-calendar';
import { loadRecaps, matchRecapsToEvents } from '@/lib/assistant/data';
import type { CalendarWeekResult } from '@/lib/assistant/types';

export const dynamic = 'force-dynamic';

async function currentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Monday 00:00 of the week containing `now` + weekOffset weeks. */
function weekRange(weekOffset: number): { start: Date; end: Date } {
  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow) + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  const end = new Date(monday);
  end.setDate(monday.getDate() + 7);
  return { start: monday, end };
}

export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const weekOffset = Number(new URL(request.url).searchParams.get('weekOffset') ?? '0') || 0;

  const empty: CalendarWeekResult = {
    connected: false,
    calendarScope: false,
    calendarUid: null,
    events: [],
  };

  let conn;
  try {
    conn = await getActiveConnectionForUserOrShared(userId);
  } catch {
    return NextResponse.json(empty);
  }
  if (!conn) return NextResponse.json(empty);
  if (!scopeHasCalendar(conn.scope)) {
    return NextResponse.json({ ...empty, connected: true });
  }

  try {
    const calendars = await listCalendars(conn.accessToken);
    const primary = calendars[0];
    if (!primary) {
      return NextResponse.json({ connected: true, calendarScope: true, calendarUid: null, events: [] });
    }
    const { start, end } = weekRange(weekOffset);
    const listed = await listEventsAllCalendars({
      accessToken: conn.accessToken,
      start,
      end,
    });
    const events = await enrichEventsWithFullDetails({
      accessToken: conn.accessToken,
      calendarUid: primary.uid,
      events: listed,
    });

    if (new URL(request.url).searchParams.get('debugAttendees') === '1') {
      return NextResponse.json({
        connected: true,
        calendarScope: true,
        calendarUid: primary.uid,
        calendars: calendars.map((c) => ({ uid: c.uid, name: c.name, isDefault: c.isDefault })),
        sample: events.slice(0, 5).map((e) => ({
          id: e.id,
          title: e.title,
          calendarUid: e.calendarUid,
          attendeeCount: e.attendeeCount,
          attendeesComplete: e.attendeesComplete,
          organizer: e.organizer,
          attendees: e.attendees.map((a) => ({ name: a.name, email: a.email, status: a.status })),
        })),
        events,
        recaps: [],
      });
    }
    // Match Dialpad recap emails against the events actually being shown so
    // recaps attach to past meetings in this week (not just today→+7d).
    const recaps = matchRecapsToEvents(await loadRecaps(userId).catch(() => []), events).filter(
      (r) => r.matchedEventId,
    );
    return NextResponse.json({
      connected: true,
      calendarScope: true,
      calendarUid: primary.uid,
      events,
      recaps,
    } satisfies CalendarWeekResult);
  } catch (err) {
    return NextResponse.json({
      connected: true,
      calendarScope: true,
      calendarUid: null,
      events: [],
      error: err instanceof Error ? err.message : 'Calendar load failed',
    } satisfies CalendarWeekResult);
  }
}

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as {
    title?: string;
    start?: string;
    end?: string;
    allDay?: boolean;
    location?: string | null;
    description?: string | null;
    meetingUrl?: string | null;
    attendees?: string[];
  };
  if (!body.title?.trim() || !body.start || !body.end) {
    return NextResponse.json({ error: 'Title, start, and end are required' }, { status: 400 });
  }

  const conn = await getActiveConnectionForUser(userId);
  if (!conn || !scopeHasCalendar(conn.scope)) {
    return NextResponse.json(
      { error: 'Calendar not connected. Reconnect Zoho with calendar access.' },
      { status: 409 },
    );
  }

  try {
    const calendars = await listCalendars(conn.accessToken);
    const primary = calendars[0];
    if (!primary) return NextResponse.json({ error: 'No calendar found' }, { status: 404 });
    await createEvent({
      accessToken: conn.accessToken,
      calendarUid: primary.uid,
      event: {
        title: body.title.trim(),
        start: body.start,
        end: body.end,
        allDay: Boolean(body.allDay),
        location: body.location ?? null,
        description: body.description ?? null,
        meetingUrl: body.meetingUrl ?? null,
        attendees: body.attendees,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Create failed' },
      { status: 502 },
    );
  }
}
