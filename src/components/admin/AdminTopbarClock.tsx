'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminTopbarMeetingDetailModal } from '@/components/admin/AdminTopbarMeetingDetailModal';

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  calendarUid?: string;
  allDay?: boolean;
  location?: string | null;
  conferenceUrl?: string | null;
};

function formatClock(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function minutesUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
}

function isInProgress(event: CalendarEvent): boolean {
  const now = Date.now();
  const start = new Date(event.start).getTime();
  const end = new Date(event.end).getTime();
  return start <= now && end > now;
}

function timingLabel(live: boolean, mins: number | null): string {
  if (live) return 'Live';
  if (mins == null) return '';
  if (mins <= 0) return 'Now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function AdminTopbarClock() {
  const [now, setNow] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/calendar/upcoming');
      if (!res.ok) return;
      const json = (await res.json()) as { events?: CalendarEvent[] };
      setEvents(json.events ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    void loadEvents();
    const refresh = setInterval(() => void loadEvents(), 60_000);
    return () => clearInterval(refresh);
  }, [loadEvents]);

  const liveMeeting = events.find(isInProgress) ?? null;
  const nextUpcoming =
    events.find((event) => new Date(event.start).getTime() > Date.now()) ?? null;
  const mins = nextUpcoming ? minutesUntil(nextUpcoming.start) : null;
  const meetingSoon = mins != null && mins >= 0 && mins <= 30;
  const activeMeeting = liveMeeting ?? (meetingSoon ? nextUpcoming : null);
  const showMeeting = Boolean(activeMeeting);
  const live = Boolean(liveMeeting);
  const when = timingLabel(live, live ? null : mins);

  return (
    <>
      <div className="admin-topbar-clock">
        {showMeeting && activeMeeting ? (
          <button
            type="button"
            className={`admin-topbar-clock-meeting${live ? ' admin-topbar-clock-meeting--live' : ''}`}
            onClick={() => setDetailEvent(activeMeeting)}
            title={
              when
                ? `${when} · ${activeMeeting.title}`
                : activeMeeting.title
            }
          >
            <span className="admin-topbar-clock-meeting-pulse" aria-hidden />
            {when ? <span className="admin-topbar-clock-meeting-timing">{when}</span> : null}
            <span className="admin-topbar-clock-meeting-title">{activeMeeting.title}</span>
          </button>
        ) : (
          <span className="admin-topbar-clock-time" title="Local time">
            {formatClock(now)}
          </span>
        )}
      </div>
      {detailEvent && (
        <AdminTopbarMeetingDetailModal event={detailEvent} onClose={() => setDetailEvent(null)} />
      )}
    </>
  );
}
