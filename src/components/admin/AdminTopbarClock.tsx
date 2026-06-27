'use client';

import { useCallback, useEffect, useState } from 'react';

type UpcomingEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
};

function formatClock(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function minutesUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
}

export function AdminTopbarClock() {
  const [now, setNow] = useState(() => new Date());
  const [nextEvent, setNextEvent] = useState<UpcomingEvent | null>(null);
  const [meetingOpen, setMeetingOpen] = useState(false);

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/calendar/upcoming');
      if (!res.ok) return;
      const json = (await res.json()) as { events?: UpcomingEvent[] };
      setNextEvent(json.events?.[0] ?? null);
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
    const refresh = setInterval(() => void loadEvents(), 5 * 60_000);
    return () => clearInterval(refresh);
  }, [loadEvents]);

  const mins = nextEvent ? minutesUntil(nextEvent.start) : null;
  const meetingSoon = mins != null && mins >= 0 && mins <= 30;

  return (
    <div className="admin-topbar-clock">
      {meetingSoon && nextEvent ? (
        <button
          type="button"
          className="admin-topbar-clock-meeting"
          onClick={() => setMeetingOpen((o) => !o)}
          title={nextEvent.title}
        >
          <span className="admin-topbar-clock-meeting-pulse" aria-hidden />
          Meeting in {mins <= 0 ? 'now' : `${mins} min`}
        </button>
      ) : (
        <span className="admin-topbar-clock-time" title="Local time">
          {formatClock(now)}
        </span>
      )}
      {meetingOpen && meetingSoon && nextEvent && (
        <div className="admin-topbar-clock-pop">
          <strong>{nextEvent.title}</strong>
          <div>
            {new Date(nextEvent.start).toLocaleString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </div>
        </div>
      )}
    </div>
  );
}
