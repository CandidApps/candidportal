import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getActiveConnectionForUser } from '@/lib/email/zoho-connections';
import { scopeHasCalendar } from '@/lib/email/zoho';
import { deleteEvent, listCalendars, updateEvent } from '@/lib/calendar/zoho-calendar';

export const dynamic = 'force-dynamic';

async function currentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function calendarConn(userId: string) {
  const conn = await getActiveConnectionForUser(userId);
  if (!conn || !scopeHasCalendar(conn.scope)) return null;
  const calendars = await listCalendars(conn.accessToken);
  const primary = calendars[0];
  if (!primary) return null;
  return { accessToken: conn.accessToken, calendarUid: primary.uid };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ eventUid: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { eventUid } = await params;
  const body = (await request.json()) as {
    title?: string;
    start?: string;
    end?: string;
    allDay?: boolean;
    location?: string | null;
    description?: string | null;
    etag?: string | null;
  };
  if (!body.title?.trim() || !body.start || !body.end) {
    return NextResponse.json({ error: 'Title, start, and end are required' }, { status: 400 });
  }

  const conn = await calendarConn(userId);
  if (!conn) {
    return NextResponse.json({ error: 'Calendar not connected.' }, { status: 409 });
  }

  try {
    await updateEvent({
      accessToken: conn.accessToken,
      calendarUid: conn.calendarUid,
      eventUid,
      etag: body.etag ?? null,
      event: {
        title: body.title.trim(),
        start: body.start,
        end: body.end,
        allDay: Boolean(body.allDay),
        location: body.location ?? null,
        description: body.description ?? null,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Update failed' },
      { status: 502 },
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ eventUid: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { eventUid } = await params;
  const etag = new URL(request.url).searchParams.get('etag');

  const conn = await calendarConn(userId);
  if (!conn) {
    return NextResponse.json({ error: 'Calendar not connected.' }, { status: 409 });
  }

  try {
    await deleteEvent({
      accessToken: conn.accessToken,
      calendarUid: conn.calendarUid,
      eventUid,
      etag,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Delete failed' },
      { status: 502 },
    );
  }
}
