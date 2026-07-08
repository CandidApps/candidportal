'use client';

import { useEffect, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { stripDialpadRecapLinkText } from '@/lib/email/dialpad-recap-link';
import { fetchCalendarEvent, type AssistantCalendarEvent } from '@/lib/assistant/types';

function fmtClock(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
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
  onClose,
}: {
  event: TopbarMeetingEvent;
  onClose: () => void;
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
          {(shown.attendees.length > 0 || loading) && (
            <div className="assist-modal-section">
              <div className="assist-modal-label">
                Participants ({shown.attendees.length})
                {loading && <span className="assist-att-loading"> · loading…</span>}
              </div>
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
          <button type="button" className="assist-mini-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
