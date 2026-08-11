'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import type { TeamMember } from '@/lib/admin-action-work';
import {
  fetchMeetingSettings,
  hasMeetingSettings,
  type MeetingSettings,
} from '@/lib/assistant/meeting-settings';
import { parseScheduleRequest, findCommonSlot, type RosterEntry } from '@/lib/assistant/schedule';
import { createCalendarEvent, fetchFreeBusy } from '@/lib/assistant/types';

type SchedulePhase = 'input' | 'finding' | 'proposed' | 'noslot' | 'error';

function fmtClock(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

function stripHtml(html: string): string {
  if (!html) return '';
  if (typeof document === 'undefined') return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent ?? '').trim();
}

export function ScheduleAssistantModal({
  currentUserId,
  currentUserName,
  members,
  initialPrompt,
  onClose,
  onScheduled,
}: {
  currentUserId: string;
  currentUserName: string;
  members: TeamMember[];
  /** Optional pre-filled scheduling request (e.g. account context). */
  initialPrompt?: string;
  onClose: () => void;
  onScheduled: () => void;
}) {
  const [text, setText] = useState(initialPrompt ?? '');
  const [phase, setPhase] = useState<SchedulePhase>('input');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [plan, setPlan] = useState<Awaited<ReturnType<typeof parseScheduleRequest>> | null>(null);
  const [slot, setSlot] = useState<{ startISO: string; endISO: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [meeting, setMeeting] = useState<MeetingSettings | null>(null);

  const selfEmail = useMemo(
    () => members.find((m) => m.id === currentUserId)?.email ?? '',
    [members, currentUserId],
  );

  useEffect(() => {
    setText(initialPrompt ?? '');
    setPhase('input');
    setError(null);
    setWarning(null);
    setPlan(null);
    setSlot(null);
  }, [initialPrompt]);

  useEffect(() => {
    void fetchMeetingSettings()
      .then(setMeeting)
      .catch(() => {});
  }, []);

  const findTime = useCallback(async () => {
    const request = text.trim();
    if (!request) return;
    setPhase('finding');
    setError(null);
    setWarning(null);
    setSlot(null);
    try {
      const roster: RosterEntry[] = members
        .filter((m) => m.email)
        .map((m) => ({ name: m.displayName, email: m.email }));
      const parsed = await parseScheduleRequest({
        text: request,
        roster,
        selfName: currentUserName,
        selfEmail: selfEmail || 'me@unknown.local',
      });
      setPlan(parsed);

      const emails = [...parsed.attendees.map((a) => a.email), ...(selfEmail ? [selfEmail] : [])];
      let busy: { start: string; end: string }[] = [];
      if (emails.length) {
        try {
          const fb = await fetchFreeBusy(emails, parsed.windowStartISO, parsed.windowEndISO);
          if (!fb.connected) {
            setWarning('Zoho isn’t connected, so availability couldn’t be checked — picking the earliest time in your window.');
          } else if (!fb.freebusyScope) {
            setWarning('Reconnect Zoho to grant availability access; for now I picked the earliest time in your window.');
          } else {
            busy = Object.values(fb.busyByEmail).flat();
          }
        } catch {
          setWarning('Availability lookup failed — picking the earliest time in your window.');
        }
      }

      const found = findCommonSlot({
        windowStartISO: parsed.windowStartISO,
        windowEndISO: parsed.windowEndISO,
        durationMinutes: parsed.durationMinutes,
        busy,
      });
      if (!found) {
        setPhase('noslot');
        return;
      }
      setSlot(found);
      setPhase('proposed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not understand that request.');
      setPhase('error');
    }
  }, [text, members, currentUserName, selfEmail]);

  const schedule = useCallback(async () => {
    if (!plan || !slot) return;
    setCreating(true);
    setError(null);
    try {
      const wantsBridge = plan.includeBridge && hasMeetingSettings(meeting);
      const dialpadLine =
        wantsBridge && meeting?.dialpadNumber?.trim() ? `Dialpad: ${meeting.dialpadNumber.trim()}` : '';
      const description = [
        plan.note,
        dialpadLine,
        wantsBridge ? stripHtml(meeting?.meetingDescription ?? '') : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      await createCalendarEvent({
        title: plan.title,
        start: slot.startISO,
        end: slot.endISO,
        allDay: false,
        attendees: plan.attendees.map((a) => a.email),
        location: wantsBridge ? meeting?.meetingLink ?? null : null,
        meetingUrl: wantsBridge ? meeting?.meetingLink ?? null : null,
        description: description || null,
      });
      onScheduled();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create the event.');
      setPhase('error');
      setCreating(false);
    }
  }, [plan, slot, meeting, onScheduled]);

  const slotStart = slot ? new Date(slot.startISO) : null;
  const slotEnd = slot ? new Date(slot.endISO) : null;

  return (
    <div className="modal-overlay open">
      <div className="modal-box assist-modal assist-schedule-modal" role="dialog" aria-label="Schedule for me">
        <div className="assist-modal-head">
          <div className="assist-modal-title">
            <AppIcon name="sparkles" size={14} /> Schedule for me
          </div>
          <button type="button" className="assist-modal-close" onClick={onClose} aria-label="Close">
            <AppIcon name="close" size={14} />
          </button>
        </div>
        <div className="assist-modal-body">
          <label className="assist-schedule-label" htmlFor="assist-schedule-input">
            Describe the meeting in plain language
          </label>
          <textarea
            id="assist-schedule-input"
            className="assist-schedule-input"
            rows={3}
            placeholder="e.g. Find a time Friday morning that Josh, Joe, and I can meet and schedule a 30-min sync with my bridge."
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={phase === 'finding' || creating}
          />

          {warning && <div className="assist-schedule-warn">{warning}</div>}
          {error && <div className="assist-schedule-error">{error}</div>}

          {phase === 'finding' && <div className="assist-schedule-status">Finding a time that works…</div>}

          {phase === 'noslot' && plan && (
            <div className="assist-schedule-status">
              No common opening for {plan.attendees.map((a) => a.name).join(', ') || 'everyone'} in that window.
              Try widening the time range.
            </div>
          )}

          {phase === 'proposed' && plan && slotStart && slotEnd && (
            <div className="assist-schedule-proposal">
              <div className="assist-schedule-prop-title">{plan.title}</div>
              <div className="assist-schedule-prop-row">
                <AppIcon name="calendar" size={12} />{' '}
                {slotStart.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} ·{' '}
                {fmtClock(slotStart)} – {fmtClock(slotEnd)}
              </div>
              <div className="assist-schedule-prop-row">
                <AppIcon name="specialist" size={12} />{' '}
                {plan.attendees.length
                  ? plan.attendees.map((a) => a.name).join(', ')
                  : 'No additional attendees'}
              </div>
              {plan.includeBridge && hasMeetingSettings(meeting) && (
                <div className="assist-schedule-prop-row">
                  <AppIcon name="link" size={12} /> Your meeting bridge will be added
                </div>
              )}
            </div>
          )}
        </div>
        <div className="assist-modal-foot">
          {phase === 'proposed' ? (
            <>
              <button
                type="button"
                className="assist-mini-btn primary"
                onClick={() => void schedule()}
                disabled={creating}
              >
                <AppIcon name="add" size={11} /> {creating ? 'Scheduling…' : 'Schedule it'}
              </button>
              <button
                type="button"
                className="assist-mini-btn"
                onClick={() => setPhase('input')}
                disabled={creating}
              >
                Adjust
              </button>
            </>
          ) : (
            <button
              type="button"
              className="assist-mini-btn primary"
              onClick={() => void findTime()}
              disabled={phase === 'finding' || !text.trim()}
            >
              <AppIcon name="sparkles" size={11} /> {phase === 'finding' ? 'Working…' : 'Find a time'}
            </button>
          )}
          <button type="button" className="assist-mini-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
