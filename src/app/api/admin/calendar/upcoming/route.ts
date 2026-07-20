import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadCalendar } from '@/lib/assistant/data';
import { getActiveConnectionForUserOrShared } from '@/lib/email/zoho-connections';
import { scopeHasCalendar } from '@/lib/email/zoho';
import { enrichEventsWithFullDetails, listCalendars } from '@/lib/calendar/zoho-calendar';
import { looksLikeAllDaySpan } from '@/lib/calendar/all-day';
import { mergeEventAttendees } from '@/lib/calendar/merge-event-detail';

export const dynamic = 'force-dynamic';

function isTimedNoticeEvent(e: { allDay: boolean; start: string; end: string }): boolean {
  if (e.allDay) return false;
  return !looksLikeAllDaySpan(e.start, e.end);
}

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
    .filter((e) => isTimedNoticeEvent(e) && new Date(e.start).getTime() <= now)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const upcoming = active
    .filter((e) => isTimedNoticeEvent(e) && new Date(e.start).getTime() > now)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  let noticeEvents = [...inProgress, ...upcoming].slice(0, 8);

  // Enrich the next few meetings the same way My Assistant does (detail + ICS
  // invites). Match enriched rows by event id only — Zoho detail can rewrite
  // start ISO slightly, which used to drop the richer guest list.
  try {
    const conn = await getActiveConnectionForUserOrShared(user.id);
    if (conn && scopeHasCalendar(conn.scope) && noticeEvents.length) {
      const calendars = await listCalendars(conn.accessToken);
      const primary = calendars[0];
      if (primary) {
        const target = noticeEvents.slice(0, 3).map((e) => ({
          ...e,
          calendarUid: e.calendarUid || primary.uid,
        }));
        const enriched = await enrichEventsWithFullDetails({
          accessToken: conn.accessToken,
          calendarUid: primary.uid,
          events: target,
          calendars,
          concurrency: 1,
          maxEnrich: 3,
          inviteFallback: true,
          accountId: conn.accountId,
        });
        const byId = new Map(enriched.map((e) => [e.id, e]));
        noticeEvents = noticeEvents.map((e) => {
          const full = byId.get(e.id);
          if (!full) return e;
          const attendees = mergeEventAttendees(e.attendees ?? [], full.attendees ?? []);
          return {
            ...e,
            ...full,
            // Keep list times so top-bar "minutes until" stays stable.
            start: e.start,
            end: e.end,
            attendees,
            attendeeCount: attendees.length,
          };
        });

        // Second pass: ICS invite map for every notice event, not only the
        // detail-fetched ones (covers teammate-organized meetings).
        if (conn.accountId) {
          const { enrichEventsFromInviteEmails } = await import(
            '@/lib/calendar/calendar-invite-attendees'
          );
          await enrichEventsFromInviteEmails({
            accessToken: conn.accessToken,
            accountId: conn.accountId,
            events: noticeEvents.map((e) => ({
              ...e,
              calendarUid: e.calendarUid || primary.uid,
            })),
          });
        }
      }
    }
  } catch {
    /* keep unenriched notice list */
  }

  const events = noticeEvents.map((e) => ({
    id: e.id,
    title: e.title,
    start: e.start,
    end: e.end,
    calendarUid: e.calendarUid,
    allDay: e.allDay,
    location: e.location,
    conferenceUrl: e.conferenceUrl,
    organizer: e.organizer,
    organizerName: e.organizerName,
    attendees: e.attendees,
    attendeeCount: e.attendeeCount,
  }));

  return NextResponse.json({
    connected: calendar.connected,
    calendarScope: calendar.calendarScope,
    error: calendar.error,
    events,
  });
}
