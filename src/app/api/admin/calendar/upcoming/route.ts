import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadCalendar } from '@/lib/assistant/data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const calendar = await loadCalendar(user.id);
  const now = Date.now();
  const active = calendar.events.filter((e) => new Date(e.end).getTime() > now);
  const inProgress = active
    .filter((e) => !e.allDay && new Date(e.start).getTime() <= now)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const upcoming = active
    .filter((e) => !e.allDay && new Date(e.start).getTime() > now)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const events = [...inProgress, ...upcoming].slice(0, 8).map((e) => ({
    id: e.id,
    title: e.title,
    start: e.start,
    end: e.end,
    calendarUid: e.calendarUid,
    allDay: e.allDay,
    location: e.location,
    conferenceUrl: e.conferenceUrl,
  }));

  return NextResponse.json({ connected: calendar.connected, events });
}
