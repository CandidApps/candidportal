'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { RichTextField } from '@/components/admin/RichTextField';
import {
  fetchMeetingSettings,
  hasMeetingSettings,
  MEETING_ATTACHMENT_UPLOAD_URL,
  type MeetingSettings,
} from '@/lib/assistant/meeting-settings';
import {
  createCalendarEvent,
  updateCalendarEvent,
  type AssistantCalendarEvent,
  type CalendarEventInput,
} from '@/lib/assistant/types';

function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function parseEmailsFromPrefill(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => isValidEmail(s));
}

function AttendeeEmailPills({
  emails,
  onChange,
}: {
  emails: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commitDraft = (raw = draft) => {
    const parts = raw
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (!parts.length) {
      setDraft('');
      return;
    }
    const next = [...emails];
    for (const p of parts) {
      if (!isValidEmail(p)) continue;
      if (next.includes(p)) continue;
      next.push(p);
    }
    onChange(next);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ' || e.key === 'Tab') {
      if (draft.trim()) {
        e.preventDefault();
        commitDraft();
      }
      return;
    }
    if (e.key === 'Backspace' && !draft && emails.length) {
      onChange(emails.slice(0, -1));
    }
  };

  return (
    <div
      className="assist-email-pills"
      onClick={() => inputRef.current?.focus()}
      role="group"
      aria-label="Attendee emails"
    >
      {emails.map((email) => (
        <span key={email} className="assist-email-pill">
          {email}
          <button
            type="button"
            className="assist-email-pill-remove"
            aria-label={`Remove ${email}`}
            onClick={(ev) => {
              ev.stopPropagation();
              onChange(emails.filter((e) => e !== email));
            }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        className="assist-email-pills-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commitDraft()}
        placeholder={emails.length ? 'Add another…' : 'name@company.com'}
      />
    </div>
  );
}

export function EventEditModal({
  event,
  defaultDate,
  prefill,
  onClose,
  onSaved,
}: {
  event: AssistantCalendarEvent | null;
  defaultDate: Date;
  prefill?: { title?: string; attendees?: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const initStart = event
    ? new Date(event.start)
    : (() => {
        const d = new Date(defaultDate);
        d.setHours(d.getHours() + 1, 0, 0, 0);
        return d;
      })();
  const initEnd = event ? new Date(event.end) : new Date(initStart.getTime() + 60 * 60 * 1000);

  const [title, setTitle] = useState(event?.title ?? prefill?.title ?? '');
  const [date, setDate] = useState(toDateInput(initStart));
  const [startTime, setStartTime] = useState(toTimeInput(initStart));
  const [endTime, setEndTime] = useState(toTimeInput(initEnd));
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [location, setLocation] = useState(event?.location ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [meetingUrl, setMeetingUrl] = useState(event?.conferenceUrl ?? '');
  const [attendees, setAttendees] = useState<string[]>(() => {
    if (event) {
      return event.attendees
        .map((a) => a.email?.trim().toLowerCase())
        .filter((e): e is string => Boolean(e) && isValidEmail(e));
    }
    return prefill?.attendees ? parseEmailsFromPrefill(prefill.attendees) : [];
  });
  const [meetingSettings, setMeetingSettings] = useState<MeetingSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchMeetingSettings()
      .then((s) => {
        if (!cancelled) setMeetingSettings(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const insertConference = () => {
    const s = meetingSettings;
    if (!s) return;
    const link = s.meetingLink.trim();
    if (link) {
      const normalized =
        /^https?:\/\//i.test(link) ? link : /^[\w.-]+\.[\w.-]+/.test(link) ? `https://${link}` : link;
      setMeetingUrl(normalized);
      setLocation((prev) =>
        prev.trim() ? (prev.includes(normalized) ? prev : `${prev} · ${normalized}`) : normalized,
      );
    }
    const dialpad = s.dialpadNumber.trim();
    const descParts: string[] = [];
    if (dialpad) {
      const digits = dialpad.replace(/[^\d+]/g, '');
      const telHref = digits ? `tel:${digits}` : '';
      descParts.push(
        telHref
          ? `Dialpad: <a href="${telHref}">${dialpad}</a>`
          : `Dialpad: ${dialpad}`,
      );
    }
    const desc = s.meetingDescription.trim();
    if (desc) descParts.push(desc);
    if (descParts.length) {
      const block = descParts.join('<br/>');
      setDescription((prev) => (prev.trim() ? `${prev}<br/><br/>${block}` : block));
    }
  };

  const save = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setBusy(true);
    setError(null);
    const startIso = new Date(`${date}T${allDay ? '00:00' : startTime}`).toISOString();
    const endIso = new Date(`${date}T${allDay ? '23:59' : endTime}`).toISOString();
    const payload: CalendarEventInput = {
      title: title.trim(),
      start: startIso,
      end: endIso,
      allDay,
      location: location.trim() || null,
      description: description.trim() || null,
      meetingUrl: meetingUrl.trim() || null,
      attendees,
    };
    try {
      if (event) {
        await updateCalendarEvent(event.id, { ...payload, etag: event.etag });
      } else {
        await createCalendarEvent(payload);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay open">
      <div className="modal-box assist-modal" role="dialog" aria-label="Edit event">
        <div className="assist-modal-head">
          <div className="assist-modal-title">{event ? 'Edit event' : 'New event'}</div>
          <button type="button" className="assist-modal-close" onClick={onClose} aria-label="Close">
            <AppIcon name="close" size={14} />
          </button>
        </div>
        <div className="assist-modal-body assist-form">
          <label className="assist-field">
            <span>Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Meeting title" />
          </label>
          <label className="assist-field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          {!allDay && (
            <div className="assist-field-row">
              <label className="assist-field">
                <span>Start</span>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </label>
              <label className="assist-field">
                <span>End</span>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </label>
            </div>
          )}
          <label className="assist-field assist-field--check">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            <span>All day</span>
          </label>
          <label className="assist-field">
            <span>Meeting URL</span>
            <input
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              placeholder="https://meetings.dialpad.com/…"
            />
          </label>
          {hasMeetingSettings(meetingSettings) && (
            <button type="button" className="assist-mini-btn assist-insert-conf" onClick={insertConference}>
              <AppIcon name="link" size={11} /> Insert conference
            </button>
          )}
          <label className="assist-field">
            <span>Location</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
          </label>
          <div className="assist-field">
            <span>Attendees</span>
            <AttendeeEmailPills emails={attendees} onChange={setAttendees} />
            <span className="assist-field-hint">Press Enter, Space, or comma to add each email as a pill.</span>
          </div>
          <div className="assist-field">
            <span>Description</span>
            <RichTextField
              value={description}
              onChange={setDescription}
              uploadUrl={MEETING_ATTACHMENT_UPLOAD_URL}
              placeholder="Optional"
              minHeight={90}
            />
          </div>
          {error && <div className="assist-form-error">{error}</div>}
        </div>
        <div className="assist-modal-foot">
          <button type="button" className="assist-mini-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="assist-mini-btn primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : event ? 'Save changes' : 'Create event'}
          </button>
        </div>
      </div>
    </div>
  );
}
