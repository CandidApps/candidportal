'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { EventEditModal } from '@/components/admin/EventEditModal';
import {
  AdminTopbarMeetingDetailModal,
  type TopbarMeetingEvent,
} from '@/components/admin/AdminTopbarMeetingDetailModal';
import { fetchCalendarEvent, type AssistantCalendarEvent } from '@/lib/assistant/types';
import { getCachedEventAttendees, rememberEventsAttendees } from '@/lib/calendar/attendee-cache';
import { mergeEventAttendees } from '@/lib/calendar/merge-event-detail';
import { looksLikeAllDaySpan } from '@/lib/calendar/all-day';

type CalendarEvent = TopbarMeetingEvent;

function isTopbarTimedEvent(event: CalendarEvent): boolean {
  if (event.allDay) return false;
  return !looksLikeAllDaySpan(event.start, event.end);
}

/** Show the next timed meeting in the top bar if it starts today (local). */
function isWithinTopbarNoticeWindow(event: CalendarEvent, now: Date): boolean {
  if (!isTopbarTimedEvent(event)) return false;
  const start = new Date(event.start);
  if (start.getTime() <= now.getTime()) return false;
  return (
    start.getFullYear() === now.getFullYear() &&
    start.getMonth() === now.getMonth() &&
    start.getDate() === now.getDate()
  );
}

const PULSE_AT_MINS = 15;
const AUTO_POPUP_AT_MINS = 5;
const AUTO_POPUP_STORAGE_KEY = 'topbar-meeting-autopopup-shown';
const DISMISSED_STORAGE_KEY = 'topbar-meeting-dismissed';

function formatClock(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function minutesUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
}

function isInProgress(event: CalendarEvent): boolean {
  if (!isTopbarTimedEvent(event)) return false;
  const nowMs = Date.now();
  const start = new Date(event.start).getTime();
  const end = new Date(event.end).getTime();
  return start <= nowMs && end > nowMs;
}

function eventStorageKey(event: CalendarEvent): string {
  return `${event.id}|${event.start}`;
}

function loadStoredSet(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveStoredSet(key: string, keys: Set<string>) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify([...keys]));
  } catch {
    /* ignore */
  }
}

function pruneStoredSet(keys: Set<string>, events: CalendarEvent[]): Set<string> {
  const active = new Set(events.map(eventStorageKey));
  const pruned = new Set([...keys].filter((k) => active.has(k)));
  return pruned.size === keys.size ? keys : pruned;
}

function useMobileViewport(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return mobile;
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

export function AdminTopbarClock({ currentUserEmail }: { currentUserEmail?: string }) {
  const [now, setNow] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [editEvent, setEditEvent] = useState<AssistantCalendarEvent | null>(null);
  const [autoPopupShown, setAutoPopupShown] = useState<Set<string>>(() =>
    loadStoredSet(AUTO_POPUP_STORAGE_KEY),
  );
  const [dismissedMeetings, setDismissedMeetings] = useState<Set<string>>(() =>
    loadStoredSet(DISMISSED_STORAGE_KEY),
  );
  const mobile = useMobileViewport();

  const timedEvents = useMemo(() => events.filter(isTopbarTimedEvent), [events]);

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/calendar/upcoming');
      if (!res.ok) return;
      const json = (await res.json()) as { events?: CalendarEvent[] };
      const next = (json.events ?? []).map((ev) => {
        const attendees = mergeEventAttendees(ev.attendees ?? [], getCachedEventAttendees(ev.id));
        return { ...ev, attendees, attendeeCount: attendees.length };
      });
      rememberEventsAttendees(next);
      setEvents(next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const nearMeeting = timedEvents.some((event) => {
      if (isInProgress(event)) return true;
      const mins = minutesUntil(event.start);
      return mins >= 0 && mins <= PULSE_AT_MINS;
    });
    const intervalMs = nearMeeting ? 10_000 : 30_000;
    const tick = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(tick);
  }, [timedEvents]);

  useEffect(() => {
    void loadEvents();
    const refresh = setInterval(() => void loadEvents(), 60_000);
    return () => clearInterval(refresh);
  }, [loadEvents]);

  useEffect(() => {
    setAutoPopupShown((prev) => {
      const pruned = pruneStoredSet(prev, timedEvents);
      if (pruned.size !== prev.size) saveStoredSet(AUTO_POPUP_STORAGE_KEY, pruned);
      return pruned;
    });
    setDismissedMeetings((prev) => {
      const pruned = pruneStoredSet(prev, timedEvents);
      if (pruned.size !== prev.size) saveStoredSet(DISMISSED_STORAGE_KEY, pruned);
      return pruned;
    });
  }, [timedEvents]);

  const liveMeeting = timedEvents.find(isInProgress) ?? null;
  const nextUpcoming =
    timedEvents.find((event) => new Date(event.start).getTime() > Date.now()) ?? null;
  const mins = nextUpcoming ? minutesUntil(nextUpcoming.start) : null;
  const meetingSoon = nextUpcoming ? isWithinTopbarNoticeWindow(nextUpcoming, now) : false;
  const pulsingSoon = !liveMeeting && mins != null && mins >= 0 && mins <= PULSE_AT_MINS;
  const upcomingDismissed = nextUpcoming
    ? dismissedMeetings.has(eventStorageKey(nextUpcoming))
    : false;
  const activeMeeting =
    liveMeeting ?? (meetingSoon && nextUpcoming && !upcomingDismissed ? nextUpcoming : null);
  const showMeeting = Boolean(activeMeeting);
  const live = Boolean(liveMeeting);
  const when = timingLabel(live, live ? null : mins);
  const startsInMinutes =
    !live && mins != null && mins > 0 && mins <= AUTO_POPUP_AT_MINS ? mins : null;

  const closeDetail = useCallback(() => {
    setDetailEvent(null);
  }, []);

  const markMeetingComplete = useCallback((event: CalendarEvent) => {
    const key = eventStorageKey(event);
    setDismissedMeetings((prev) => {
      const next = new Set(prev).add(key);
      saveStoredSet(DISMISSED_STORAGE_KEY, next);
      return next;
    });
    setDetailEvent(null);
  }, []);

  const openEdit = useCallback(async (event: CalendarEvent) => {
    try {
      const detail = await fetchCalendarEvent(event.id, event.calendarUid);
      if (detail) setEditEvent(detail);
    } catch {
      /* ignore */
    }
  }, []);

  // Auto-open the meeting modal once when within 5 minutes of start.
  useEffect(() => {
    if (!nextUpcoming || liveMeeting || upcomingDismissed) return;
    const until = minutesUntil(nextUpcoming.start);
    if (until > AUTO_POPUP_AT_MINS || until < 0) return;
    const key = eventStorageKey(nextUpcoming);
    if (autoPopupShown.has(key)) return;
    setAutoPopupShown((prev) => {
      const next = new Set(prev).add(key);
      saveStoredSet(AUTO_POPUP_STORAGE_KEY, next);
      return next;
    });
    setDetailEvent(nextUpcoming);
  }, [nextUpcoming, liveMeeting, autoPopupShown, upcomingDismissed, now]);

  return (
    <>
      <div className="admin-topbar-clock">
        {showMeeting && activeMeeting ? (
          <button
            type="button"
            className={`admin-topbar-clock-meeting${live ? ' admin-topbar-clock-meeting--live' : ''}${pulsingSoon ? ' admin-topbar-clock-meeting--soon' : ''}${mobile ? ' admin-topbar-clock-meeting--mobile' : ''}`}
            onClick={() => setDetailEvent(activeMeeting)}
            title={when ? `${when} · ${activeMeeting.title}` : activeMeeting.title}
          >
            {mobile ? (
              <>
                <span className="admin-topbar-clock-meeting-icon" aria-hidden>
                  <AppIcon name="calendar" size={14} />
                </span>
                {when ? <span className="admin-topbar-clock-meeting-timing">{when}</span> : null}
              </>
            ) : (
              <>
                <span className="admin-topbar-clock-meeting-pulse" aria-hidden />
                {when ? <span className="admin-topbar-clock-meeting-timing">{when}</span> : null}
                <span className="admin-topbar-clock-meeting-title">{activeMeeting.title}</span>
              </>
            )}
          </button>
        ) : (
          <span className="admin-topbar-clock-time" title="Local time">
            {formatClock(now)}
          </span>
        )}
      </div>
      {detailEvent && (
        <AdminTopbarMeetingDetailModal
          event={detailEvent}
          currentUserEmail={currentUserEmail}
          startsInMinutes={
            detailEvent.id === nextUpcoming?.id && !liveMeeting ? startsInMinutes : null
          }
          onClose={closeDetail}
          onMarkComplete={() => markMeetingComplete(detailEvent)}
          onEdit={() => void openEdit(detailEvent)}
        />
      )}
      {editEvent && (
        <EventEditModal
          event={editEvent}
          defaultDate={new Date(editEvent.start)}
          onClose={() => setEditEvent(null)}
          onSaved={() => {
            setEditEvent(null);
            void loadEvents();
            setDetailEvent(null);
          }}
        />
      )}
    </>
  );
}
