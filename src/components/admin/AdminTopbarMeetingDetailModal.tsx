'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { stripDialpadRecapLinkText } from '@/lib/email/dialpad-recap-link';
import { fetchCalendarEvent, type AssistantCalendarEvent } from '@/lib/assistant/types';

function fmtClock(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function emailsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

type TopbarMeetingEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  calendarUid?: string;
  allDay?: boolean;
  location?: string | null;
  conferenceUrl?: string | null;
};

export function AdminTopbarMeetingDetailModal({
  event,
  currentUserEmail,
  startsInMinutes,
  onClose,
  onEdit,
  onMarkComplete,
}: {
  event: TopbarMeetingEvent;
  currentUserEmail?: string;
  /** When set, shows a prominent "starting soon" banner above meeting details. */
  startsInMinutes?: number | null;
  onClose: () => void;
  onEdit?: () => void;
  onMarkComplete?: () => void;
}) {
  const [full, setFull] = useState<AssistantCalendarEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setFull(null);
    setLoading(true);
    void fetchCalendarEvent(event.id, event.calendarUid)
      .then((detail) => {
        if (!cancelled && detail) setFull(detail);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [event.id, event.calendarUid]);

  const shown = full ?? {
    ...event,
    description: null,
    dialpadRecapUrl: null,
    attendees: [],
    attendeeCount: 0,
    attendeesComplete: false,
    etag: null,
    organizer: null,
    organizerName: null,
  };
  const start = new Date(shown.start);
  const end = new Date(shown.end);
  const joinUrl = shown.conferenceUrl || event.conferenceUrl;
  const desc = stripDialpadRecapLinkText(shown.description || '', shown.dialpadRecapUrl);

  const isOrganizer = useMemo(() => {
    if (!currentUserEmail) return false;
    if (emailsMatch(shown.organizer, currentUserEmail)) return true;
    return shown.attendees.some(
      (a) => a.isOrganizer && emailsMatch(a.email, currentUserEmail),
    );
  }, [shown.attendees, shown.organizer, currentUserEmail]);

  const participantEmails = useMemo(
    () =>
      shown.attendees
        .map((a) => a.email?.trim())
        .filter((email): email is string => Boolean(email)),
    [shown.attendees],
  );

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box assist-modal" role="dialog" aria-label="Meeting details">
        <div className="assist-modal-head">
          <div className="assist-modal-title">{shown.title}</div>
          <button type="button" className="assist-modal-close" onClick={onClose} aria-label="Close">
            <AppIcon name="close" size={14} />
          </button>
        </div>
        <div className="assist-modal-body">
          {startsInMinutes != null && startsInMinutes > 0 && (
            <div className="admin-topbar-meeting-soon-banner" role="status">
              <AppIcon name="calendar" size={14} />
              <span>
                Your meeting is starting in {startsInMinutes} minute{startsInMinutes === 1 ? '' : 's'}
              </span>
            </div>
          )}
          <div className="assist-modal-meta">
            <AppIcon name="calendar" size={12} />{' '}
            {start.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            {shown.allDay ? ' · All day' : ` · ${fmtClock(start)} – ${fmtClock(end)}`}
          </div>
          {(shown.location || event.location) && (
            <div className="assist-modal-meta">
              <AppIcon name="building" size={12} /> {shown.location || event.location}
            </div>
          )}
          {(shown.organizerName || shown.organizer) && (
            <div className="assist-modal-meta">
              <AppIcon name="specialist" size={12} /> Organized by {shown.organizerName || shown.organizer}
            </div>
          )}
          {joinUrl && (
            <div className="assist-modal-meta">
              <AppIcon name="link" size={12} />{' '}
              <a href={joinUrl} target="_blank" rel="noreferrer">
                Join meeting
              </a>
            </div>
          )}
          {desc && <div className="assist-modal-desc">{desc}</div>}
          {(shown.attendees.length > 0 || loading || participantEmails.length > 0) && (
            <div className="assist-modal-section">
              <div className="assist-modal-label">
                Participants ({shown.attendees.length})
                {loading && <span className="assist-att-loading"> · loading…</span>}
              </div>
              {participantEmails.length > 0 && (
                <div className="admin-topbar-meeting-emails">
                  {participantEmails.map((email) => (
                    <a key={email} href={`mailto:${email}`} className="admin-topbar-meeting-email">
                      {email}
                    </a>
                  ))}
                </div>
              )}
              {shown.attendees.length > 0 && (
                <div className="assist-attendees">
                  {shown.attendees.map((a) => (
                    <div key={a.email || a.name} className="assist-attendee">
                      <span className={`assist-att-dot assist-att-dot--${a.status}`} />
                      <span className="assist-att-name">{a.name}</span>
                      {a.isOrganizer && <span className="assist-attendee-tag">Organizer</span>}
                      {a.email && <span className="assist-att-email">{a.email}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="assist-modal-foot">
          {joinUrl && (
            <a href={joinUrl} target="_blank" rel="noreferrer" className="assist-mini-btn primary">
              <AppIcon name="link" size={11} /> Join meeting
            </a>
          )}
          {isOrganizer && onEdit && (
            <button type="button" className="assist-mini-btn" onClick={onEdit}>
              <AppIcon name="calendar" size={11} /> Edit event
            </button>
          )}
          {onMarkComplete && (
            <button type="button" className="assist-mini-btn" onClick={onMarkComplete}>
              <AppIcon name="check" size={11} /> Mark complete
            </button>
          )}
          <button type="button" className="assist-mini-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
