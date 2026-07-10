'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import type { AssistantCall, AssistantCalendarEvent } from '@/lib/assistant/types';

type CommsFilter = 'recent' | 'calls' | 'meetings' | 'voicemails';

export type CommunicationsContact = {
  name?: string;
  email?: string;
  phone?: string;
};

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

function formatCallDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
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

function isVoicemailCall(call: AssistantCall): boolean {
  const s = (call.state ?? '').toLowerCase();
  if (/voicemail/.test(s)) return true;
  if (
    call.direction === 'inbound' &&
    (call.durationSeconds ?? 0) === 0 &&
    /missed|no.?answer|abandon|unanswered/.test(s)
  ) {
    return true;
  }
  return false;
}

function meetingStatus(ev: AssistantCalendarEvent): 'past' | 'now' | 'upcoming' {
  const now = Date.now();
  const start = new Date(ev.start).getTime();
  const end = new Date(ev.end).getTime() || start;
  if (end < now) return 'past';
  if (start <= now && end >= now) return 'now';
  return 'upcoming';
}

function CallRow({ call }: { call: AssistantCall }) {
  const [open, setOpen] = useState(false);
  const name = call.contactName || call.contactPhone || 'Unknown caller';
  const duration = formatCallDuration(call.durationSeconds);
  const hasDetail = Boolean(call.recapSummary || call.transcriptText);
  const dirLabel =
    call.direction === 'inbound' ? 'Inbound' : call.direction === 'outbound' ? 'Outbound' : 'Call';
  const voicemail = isVoicemailCall(call);

  return (
    <div className="assist-call">
      <div className="assist-call-main">
        <span className={`assist-call-dir assist-call-dir--${call.direction}`}>
          <AppIcon name={voicemail ? 'broadcast' : 'phone'} size={12} />
        </span>
        <div className="assist-call-body">
          <div className="assist-call-title">
            {name}
            {call.agentName ? <span className="assist-call-agent"> · {call.agentName}</span> : null}
          </div>
          <div className="assist-call-sub">
            {voicemail ? 'Voicemail / missed' : dirLabel}
            {duration ? ` · ${duration}` : ''}
            {call.state ? ` · ${call.state}` : ''}
            {call.startedAt ? ` · ${relativeTime(call.startedAt)}` : ''}
          </div>
        </div>
        <div className="assist-call-actions">
          {call.contactPhone && (
            <a className="assist-icon-btn" href={`tel:${call.contactPhone}`} title="Call back">
              <AppIcon name="phone" size={12} />
            </a>
          )}
          {call.contactEmail && (
            <a
              className="assist-icon-btn"
              href={`mailto:${encodeURIComponent(call.contactEmail)}`}
              title="Email contact"
            >
              <AppIcon name="email" size={12} />
            </a>
          )}
          {call.recordingUrl && (
            <a
              className="assist-icon-btn"
              href={call.recordingUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open recording"
            >
              <AppIcon name="broadcast" size={12} />
            </a>
          )}
          {hasDetail && (
            <button type="button" className="assist-mini-btn" onClick={() => setOpen((v) => !v)}>
              {open ? 'Hide' : 'Recap'}
            </button>
          )}
        </div>
      </div>
      {open && hasDetail && (
        <div className="assist-call-detail">
          {call.recapSummary && <p className="assist-call-recap">{call.recapSummary}</p>}
          {!call.recapSummary && call.transcriptText && (
            <p className="assist-call-recap">{call.transcriptText.slice(0, 600)}</p>
          )}
        </div>
      )}
    </div>
  );
}

function MeetingRow({
  meeting,
  contactEmails,
}: {
  meeting: AssistantCalendarEvent;
  contactEmails: Set<string>;
}) {
  const status = meetingStatus(meeting);
  const matched = meeting.attendees.filter((a) =>
    contactEmails.has(a.email?.trim().toLowerCase() ?? ''),
  );
  const matchedLabel =
    matched.length > 0
      ? matched.map((a) => a.name || a.email).slice(0, 3).join(', ')
      : meeting.organizer && contactEmails.has(meeting.organizer.trim().toLowerCase())
        ? meeting.organizer
        : null;

  return (
    <div className={`assist-call${status === 'past' ? ' is-past' : ''}`}>
      <div className="assist-call-main">
        <span className="assist-call-dir assist-call-dir--inbound">
          <AppIcon name="calendar" size={12} />
        </span>
        <div className="assist-call-body">
          <div className="assist-call-title">{meeting.title || 'Meeting'}</div>
          <div className="assist-call-sub">
            {status === 'now' ? 'In progress · ' : status === 'upcoming' ? 'Upcoming · ' : 'Past · '}
            {formatMeetingWhen(meeting.start, meeting.end)}
            {matchedLabel ? ` · ${matchedLabel}` : ''}
            {meeting.attendeeCount > 0 ? ` · ${meeting.attendeeCount} attendees` : ''}
          </div>
        </div>
        <div className="assist-call-actions">
          {meeting.conferenceUrl && (
            <a
              className="assist-icon-btn"
              href={meeting.conferenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Join meeting"
            >
              <AppIcon name="link" size={12} />
            </a>
          )}
          {matched[0]?.email && (
            <a
              className="assist-icon-btn"
              href={`mailto:${encodeURIComponent(matched[0].email)}`}
              title="Email attendee"
            >
              <AppIcon name="email" size={12} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

type RecentItem =
  | { kind: 'call'; id: string; at: number; call: AssistantCall }
  | { kind: 'meeting'; id: string; at: number; meeting: AssistantCalendarEvent };

export function CustomerCommunicationsPanel({
  customerId,
  customerName,
  contacts,
  entityLabel = 'account',
}: {
  /** CRM external id when on an account page; omit for suppliers/partners. */
  customerId?: string;
  customerName: string;
  contacts: CommunicationsContact[];
  /** Used in empty-state copy (“account” / “supplier”). */
  entityLabel?: string;
}) {
  const [filter, setFilter] = useState<CommsFilter>('recent');
  const [calls, setCalls] = useState<AssistantCall[]>([]);
  const [meetings, setMeetings] = useState<AssistantCalendarEvent[]>([]);
  const [connected, setConnected] = useState(true);
  const [calendarConnected, setCalendarConnected] = useState(true);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  const emails = useMemo(
    () => contacts.map((c) => c.email?.trim()).filter((e): e is string => Boolean(e)),
    [contacts],
  );
  const phones = useMemo(
    () => contacts.map((c) => c.phone?.trim()).filter((p): p is string => Boolean(p)),
    [contacts],
  );
  const emailSet = useMemo(
    () => new Set(emails.map((e) => e.toLowerCase())),
    [emails],
  );

  const load = useCallback(
    async (opts?: { sync?: boolean }) => {
      if (!customerId && !emails.length && !phones.length) {
        setCalls([]);
        setMeetings([]);
        setLoading(false);
        return;
      }
      if (opts?.sync) setSyncing(true);
      else setLoading(true);
      setError('');
      try {
        const callParams = new URLSearchParams({ limit: '50' });
        if (customerId) callParams.set('customerId', customerId);
        if (emails.length) callParams.set('emails', emails.join(','));
        if (phones.length) callParams.set('phones', phones.join(','));
        if (opts?.sync) callParams.set('sync', '1');

        const meetingParams = new URLSearchParams();
        if (emails.length) meetingParams.set('emails', emails.join(','));

        const [callsRes, meetingsRes] = await Promise.all([
          fetch(`/api/admin/dialpad/calls?${callParams.toString()}`, { cache: 'no-store' }),
          emails.length
            ? fetch(`/api/admin/calendar/customer-meetings?${meetingParams.toString()}`, {
                cache: 'no-store',
              })
            : Promise.resolve(null),
        ]);

        const callsJson = (await callsRes.json()) as {
          calls?: AssistantCall[];
          connected?: boolean;
          error?: string;
        };
        if (!callsRes.ok) throw new Error(callsJson.error ?? 'Failed to load calls');
        setCalls(callsJson.calls ?? []);
        setConnected(callsJson.connected !== false);

        if (meetingsRes) {
          const meetingsJson = (await meetingsRes.json()) as {
            meetings?: AssistantCalendarEvent[];
            connected?: boolean;
            calendarScope?: boolean;
            error?: string;
          };
          if (meetingsRes.ok) {
            setMeetings(meetingsJson.meetings ?? []);
            setCalendarConnected(
              meetingsJson.connected !== false && meetingsJson.calendarScope !== false,
            );
          } else {
            setMeetings([]);
            setCalendarConnected(false);
          }
        } else {
          setMeetings([]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load communications');
        setCalls([]);
        setMeetings([]);
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    [customerId, emails, phones],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const voicemails = useMemo(() => calls.filter(isVoicemailCall), [calls]);

  const recentItems = useMemo((): RecentItem[] => {
    const items: RecentItem[] = [
      ...calls.map((call) => ({
        kind: 'call' as const,
        id: `call-${call.id}`,
        at: call.startedAt ? Date.parse(call.startedAt) : 0,
        call,
      })),
      ...meetings.map((meeting) => ({
        kind: 'meeting' as const,
        id: `meeting-${meeting.id}`,
        at: Date.parse(meeting.start) || 0,
        meeting,
      })),
    ];
    return items.sort((a, b) => b.at - a.at).slice(0, 40);
  }, [calls, meetings]);

  const contactHint =
    emails.length || phones.length
      ? `Matched to ${contacts.length} contact${contacts.length === 1 ? '' : 's'} on ${customerName}`
      : `No contact emails or phones on file for ${customerName}`;

  const emptyEntity = entityLabel;

  return (
    <div className="card assist-card" style={{ border: 'none', boxShadow: 'none', margin: 0 }}>
      <div className="card-header assist-comms-header" style={{ padding: '0 0 12px' }}>
        <div className="assist-comms-header-top">
          <div className="assist-comms-filters" role="tablist" aria-label="Communications filter">
            {(
              [
                ['recent', 'Recent', recentItems.length],
                ['calls', 'Calls', calls.length],
                ['meetings', 'Meetings', meetings.length],
                ['voicemails', 'Voicemails', voicemails.length],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={filter === id}
                className={`assist-comms-pill${filter === id ? ' active' : ''}`}
                onClick={() => setFilter(id)}
              >
                {label}
                {count > 0 && <span className="assist-seg-count">{count}</span>}
              </button>
            ))}
          </div>
          <div className="assist-comms-header-actions">
            {connected && (
              <button
                type="button"
                className="assist-mini-btn"
                onClick={() => void load({ sync: true })}
                disabled={syncing || loading}
              >
                <AppIcon name="sync" size={11} className={syncing ? 'spin' : undefined} />{' '}
                {syncing ? 'Syncing…' : 'Sync'}
              </button>
            )}
          </div>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--gray)' }}>{contactHint}</p>
      </div>

      <div className="card-body assist-scroll" style={{ padding: 0, maxHeight: 420 }}>
        {loading && <p className="assist-empty">Loading communications…</p>}
        {!loading && error && <p className="assist-empty">{error}</p>}

        {!loading && !error && filter === 'recent' && (
          <>
            {recentItems.length === 0 && (
              <p className="assist-empty">
                No calls or meetings matched to this {emptyEntity}&apos;s contacts yet.
              </p>
            )}
            {recentItems.map((item) =>
              item.kind === 'call' ? (
                <CallRow key={item.id} call={item.call} />
              ) : (
                <MeetingRow key={item.id} meeting={item.meeting} contactEmails={emailSet} />
              ),
            )}
          </>
        )}

        {!loading && !error && filter === 'calls' && (
          <>
            {!connected && (
              <p className="assist-empty">
                Dialpad isn&apos;t connected. Add <code>DIALPAD_API_KEY</code> to enable call history.
              </p>
            )}
            {connected && calls.length === 0 && (
              <p className="assist-empty">
                No calls matched to this {emptyEntity}&apos;s contacts yet.
              </p>
            )}
            {calls.map((c) => (
              <CallRow key={c.id} call={c} />
            ))}
          </>
        )}

        {!loading && !error && filter === 'meetings' && (
          <>
            {!emails.length && (
              <p className="assist-empty">
                Add contact email addresses on this {emptyEntity} to match calendar meetings.
              </p>
            )}
            {emails.length > 0 && !calendarConnected && (
              <p className="assist-empty">
                Calendar isn&apos;t connected. Reconnect Zoho with calendar access to see meetings.
              </p>
            )}
            {emails.length > 0 && calendarConnected && meetings.length === 0 && (
              <p className="assist-empty">
                No meetings found with these contact emails (last 90 days / next 60 days).
              </p>
            )}
            {meetings.map((m) => (
              <MeetingRow key={m.id} meeting={m} contactEmails={emailSet} />
            ))}
          </>
        )}

        {!loading && !error && filter === 'voicemails' && (
          <>
            {voicemails.length === 0 && (
              <p className="assist-empty">
                No voicemails or missed calls for this {emptyEntity} yet.
              </p>
            )}
            {voicemails.map((c) => (
              <CallRow key={c.id} call={c} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export default CustomerCommunicationsPanel;
