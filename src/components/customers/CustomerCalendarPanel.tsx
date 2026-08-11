'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { PhoneLink } from '@/components/shared/PhoneLink';
import type { AssistantCall, AssistantCalendarEvent, AssistantRecap } from '@/lib/assistant/types';
import { stripDialpadRecapLinkText } from '@/lib/email/dialpad-recap-link';
import { EventEditModal } from '@/components/admin/EventEditModal';
import { ScheduleAssistantModal } from '@/components/admin/ScheduleAssistantModal';
import { fetchTeamMembers } from '@/lib/team-notes';
import type { TeamMember } from '@/lib/admin-action-work';

type Tab = 'upcoming' | 'past' | 'recaps';

function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60_000);
  if (Math.abs(mins) < 1) return 'just now';
  if (mins > 0 && mins < 60) return `${mins}m ago`;
  if (mins < 0 && mins > -60) return `in ${-mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs > 0 && hrs < 24) return `${hrs}h ago`;
  if (hrs < 0 && hrs > -24) return `in ${-hrs}h`;
  const days = Math.round(hrs / 24);
  if (days > 0 && days < 14) return `${days}d ago`;
  if (days < 0 && days > -14) return `in ${-days}d`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMeetingWhen(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime())) return '';
  const day = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const startTime = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const endTime = Number.isNaN(end.getTime())
    ? ''
    : end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return endTime ? `${day} · ${startTime} – ${endTime}` : `${day} · ${startTime}`;
}

function meetingStatus(ev: AssistantCalendarEvent): 'past' | 'now' | 'upcoming' {
  const now = Date.now();
  const start = new Date(ev.start).getTime();
  const end = new Date(ev.end).getTime() || start;
  if (end < now) return 'past';
  if (start <= now && end >= now) return 'now';
  return 'upcoming';
}

function formatCallDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function CustomerCalendarPanel({
  customerId,
  customerName,
  contactEmails,
  currentUserId,
  currentUserName,
}: {
  customerId: string;
  customerName: string;
  contactEmails: string[];
  currentUserId?: string;
  currentUserName?: string;
}) {
  const [tab, setTab] = useState<Tab>('upcoming');
  const [meetings, setMeetings] = useState<AssistantCalendarEvent[]>([]);
  const [recaps, setRecaps] = useState<AssistantRecap[]>([]);
  const [calls, setCalls] = useState<AssistantCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [calendarConnected, setCalendarConnected] = useState(true);
  const [eventEditOpen, setEventEditOpen] = useState(false);
  const [scheduleAIOpen, setScheduleAIOpen] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [expandedMeetingId, setExpandedMeetingId] = useState<string | null>(null);

  const attendeePrefill = contactEmails.join(', ');

  const load = useCallback(async () => {
    if (!contactEmails.length) {
      setMeetings([]);
      setRecaps([]);
      setCalls([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const meetingParams = new URLSearchParams({ emails: contactEmails.join(',') });
      const callParams = new URLSearchParams({ limit: '30', customerId, emails: contactEmails.join(',') });

      const [meetingsRes, callsRes] = await Promise.all([
        fetch(`/api/admin/calendar/customer-meetings?${meetingParams.toString()}`, { cache: 'no-store' }),
        fetch(`/api/admin/dialpad/calls?${callParams.toString()}`, { cache: 'no-store' }),
      ]);

      const meetingsJson = (await meetingsRes.json()) as {
        meetings?: AssistantCalendarEvent[];
        recaps?: AssistantRecap[];
        connected?: boolean;
        calendarScope?: boolean;
        error?: string;
      };
      if (!meetingsRes.ok) throw new Error(meetingsJson.error ?? 'Failed to load meetings');
      setMeetings(meetingsJson.meetings ?? []);
      setRecaps(meetingsJson.recaps ?? []);
      setCalendarConnected(meetingsJson.connected !== false && meetingsJson.calendarScope !== false);

      const callsJson = (await callsRes.json()) as { calls?: AssistantCall[]; error?: string };
      if (callsRes.ok) setCalls(callsJson.calls ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendar');
      setMeetings([]);
      setRecaps([]);
      setCalls([]);
    } finally {
      setLoading(false);
    }
  }, [contactEmails, customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!scheduleAIOpen || members.length) return;
    void fetchTeamMembers()
      .then(setMembers)
      .catch(() => {});
  }, [scheduleAIOpen, members.length]);

  const recapByEventId = useMemo(() => {
    const map = new Map<string, AssistantRecap>();
    for (const r of recaps) {
      if (r.matchedEventId) map.set(r.matchedEventId, r);
    }
    return map;
  }, [recaps]);

  const upcomingMeetings = useMemo(
    () =>
      meetings
        .filter((m) => meetingStatus(m) !== 'past')
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [meetings],
  );

  const pastMeetings = useMemo(
    () =>
      meetings
        .filter((m) => meetingStatus(m) === 'past')
        .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()),
    [meetings],
  );

  const callsWithRecap = useMemo(
    () => calls.filter((c) => Boolean(c.recapSummary || c.transcriptText)),
    [calls],
  );

  const openScheduleMenu = () => setEventEditOpen(true);

  return (
    <div className="cust-calendar">
      <div className="cust-email-toolbar">
        <div className="cust-email-mailbox">
          {calendarConnected
            ? `${meetings.length} meeting(s) with account contacts`
            : 'Connect Zoho calendar to see meetings'}
        </div>
        <div className="cust-email-actions">
          <button type="button" className="admin-ticket-btn" disabled={loading} onClick={() => void load()}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button type="button" className="admin-ticket-btn" onClick={openScheduleMenu}>
            <AppIcon name="calendar" size={12} /> Schedule
          </button>
          {currentUserId && currentUserName ? (
            <button type="button" className="admin-ticket-btn primary" onClick={() => setScheduleAIOpen(true)}>
              <AppIcon name="sparkles" size={12} /> Schedule for me
            </button>
          ) : null}
        </div>
      </div>

      <div className="cust-calendar-tabs">
        {(
          [
            { id: 'upcoming' as Tab, label: `Upcoming (${upcomingMeetings.length})` },
            { id: 'past' as Tab, label: `Past (${pastMeetings.length})` },
            { id: 'recaps' as Tab, label: `Dialpad recaps (${recaps.length + callsWithRecap.length})` },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            className={`cust-calendar-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? <div className="cust-email-error">{error}</div> : null}

      {loading && meetings.length === 0 ? (
        <div className="cust-email-empty">Loading calendar…</div>
      ) : tab === 'upcoming' ? (
        upcomingMeetings.length === 0 ? (
          <div className="cust-email-empty">No upcoming meetings with contacts on {customerName}.</div>
        ) : (
          <ul className="cust-calendar-list">
            {upcomingMeetings.map((m) => (
              <MeetingCard
                key={m.id}
                meeting={m}
                recap={recapByEventId.get(m.id)}
                expanded={expandedMeetingId === m.id}
                onToggle={() => setExpandedMeetingId((id) => (id === m.id ? null : m.id))}
              />
            ))}
          </ul>
        )
      ) : tab === 'past' ? (
        pastMeetings.length === 0 ? (
          <div className="cust-email-empty">No past meetings found.</div>
        ) : (
          <ul className="cust-calendar-list">
            {pastMeetings.map((m) => (
              <MeetingCard
                key={m.id}
                meeting={m}
                recap={recapByEventId.get(m.id)}
                expanded={expandedMeetingId === m.id}
                onToggle={() => setExpandedMeetingId((id) => (id === m.id ? null : m.id))}
              />
            ))}
          </ul>
        )
      ) : recaps.length === 0 && callsWithRecap.length === 0 ? (
        <div className="cust-email-empty">No Dialpad recaps matched to this account yet.</div>
      ) : (
        <div className="cust-calendar-recaps">
          {recaps.map((r) => (
            <div key={r.id} className="assist-recap-block">
              <div className="assist-recap-title">{r.title}</div>
              {r.summary ? (
                <div className="assist-recap-summary">
                  {stripDialpadRecapLinkText(r.summary, r.recapUrl)}
                </div>
              ) : null}
              <div className="assist-comm-recent-meta">{relativeTime(new Date(r.receivedTime).toISOString())}</div>
              {r.recapUrl ? (
                <a className="assist-mini-btn" href={r.recapUrl} target="_blank" rel="noopener noreferrer">
                  View AI Recap
                </a>
              ) : null}
            </div>
          ))}
          {callsWithRecap.map((call) => (
            <div key={call.id} className="assist-call">
              <div className="assist-call-main">
                <span className={`assist-call-dir assist-call-dir--${call.direction}`}>
                  <AppIcon name="phone" size={12} />
                </span>
                <div className="assist-call-body">
                  <div className="assist-call-title">
                    {!call.contactName && call.contactPhone ? (
                      <PhoneLink phone={call.contactPhone} />
                    ) : (
                      call.contactName || 'Call'
                    )}
                  </div>
                  <div className="assist-call-sub">
                    {formatCallDuration(call.durationSeconds)}
                    {call.startedAt ? ` · ${relativeTime(call.startedAt)}` : ''}
                  </div>
                </div>
              </div>
              {call.recapSummary ? (
                <div className="assist-call-detail">
                  <p className="assist-call-recap">{call.recapSummary}</p>
                </div>
              ) : call.transcriptText ? (
                <div className="assist-call-detail">
                  <p className="assist-call-recap">{call.transcriptText.slice(0, 800)}</p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {eventEditOpen ? (
        <EventEditModal
          event={null}
          defaultDate={new Date()}
          prefill={{
            title: `Meeting with ${customerName}`,
            attendees: attendeePrefill,
          }}
          onClose={() => setEventEditOpen(false)}
          onSaved={() => {
            setEventEditOpen(false);
            void load();
          }}
        />
      ) : null}

      {scheduleAIOpen && currentUserId && currentUserName ? (
        <ScheduleAssistantModal
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          members={members}
          initialPrompt={`Schedule a meeting with ${customerName}${attendeePrefill ? ` (${attendeePrefill})` : ''}`}
          onClose={() => setScheduleAIOpen(false)}
          onScheduled={() => {
            setScheduleAIOpen(false);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function MeetingCard({
  meeting,
  recap,
  expanded,
  onToggle,
}: {
  meeting: AssistantCalendarEvent;
  recap?: AssistantRecap;
  expanded: boolean;
  onToggle: () => void;
}) {
  const status = meetingStatus(meeting);
  return (
    <li className="cust-calendar-item">
      <button type="button" className="cust-calendar-row" onClick={onToggle}>
        <span className="assist-call-dir assist-call-dir--inbound">
          <AppIcon name="calendar" size={12} />
        </span>
        <div className="cust-calendar-main">
          <div className="cust-calendar-title">
            {meeting.title || 'Meeting'}
            {recap ? <span className="cust-calendar-recap-badge">Recap</span> : null}
            {status === 'now' ? <span className="cust-calendar-now-badge">Now</span> : null}
          </div>
          <div className="cust-calendar-sub">{formatMeetingWhen(meeting.start, meeting.end)}</div>
        </div>
        {meeting.conferenceUrl ? (
          <a
            className="assist-icon-btn"
            href={meeting.conferenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Join"
            onClick={(e) => e.stopPropagation()}
          >
            <AppIcon name="link" size={12} />
          </a>
        ) : null}
      </button>
      {expanded ? (
        <div className="cust-calendar-detail">
          {meeting.attendees.length > 0 ? (
            <div className="cust-calendar-attendees">
              {meeting.attendees.map((a) => a.email).filter(Boolean).join(', ')}
            </div>
          ) : null}
          {meeting.description ? (
            <div className="cust-calendar-desc">{meeting.description.slice(0, 1200)}</div>
          ) : null}
          {recap?.summary ? (
            <div className="assist-recap-summary">
              {stripDialpadRecapLinkText(recap.summary, recap.recapUrl)}
            </div>
          ) : null}
          {recap?.recapUrl ? (
            <a href={recap.recapUrl} target="_blank" rel="noopener noreferrer" className="assist-mini-btn">
              View AI Recap
            </a>
          ) : meeting.dialpadRecapUrl ? (
            <a
              href={meeting.dialpadRecapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="assist-mini-btn"
            >
              View recap
            </a>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
