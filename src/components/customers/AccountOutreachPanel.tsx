'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AccountOutreachRecord } from '@/app/api/admin/outreach/account-activity/route';
import type { OutreachActivityEntry } from '@/lib/outreach-server';
import {
  OUTREACH_HELP_LABELS,
  OUTREACH_STATUS_LABELS,
  type OutreachHelpOption,
  type OutreachStatus,
} from '@/lib/outreach';

function statusLabel(s: string | null | undefined): string {
  return (s && OUTREACH_STATUS_LABELS[s as OutreachStatus]) || (s ?? '').replace(/_/g, ' ') || '—';
}

function helpLabel(s: string | null | undefined): string | null {
  if (!s || s === 'no_current_need') return null;
  return OUTREACH_HELP_LABELS[s as OutreachHelpOption] ?? s.replace(/_/g, ' ');
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function legacyNoteText(note: string | null): string {
  // Historical auto notes start with "Outreach update — Company"; drop that header line.
  return (note ?? '').split('\n').slice(1).join(' · ').trim();
}

/** Account-level Outreach status + activity log (outreach updates no longer post team notes). */
export function AccountOutreachPanel({ customerId }: { customerId: string }) {
  const [records, setRecords] = useState<AccountOutreachRecord[]>([]);
  const [activity, setActivity] = useState<OutreachActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/outreach/account-activity?customerId=${encodeURIComponent(customerId)}`);
      const data = (await res.json()) as {
        records?: AccountOutreachRecord[];
        activity?: OutreachActivityEntry[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load outreach');
      setRecords(data.records ?? []);
      setActivity(data.activity ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load outreach');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <div className="acct-outreach-empty">Loading outreach…</div>;
  if (error) return <div className="acct-outreach-empty">{error}</div>;
  if (!records.length && !activity.length) {
    return <div className="acct-outreach-empty">Not on anyone&apos;s Outreach list yet.</div>;
  }

  return (
    <div className="acct-outreach">
      {records.map((r) => (
        <div key={r.id} className="acct-outreach-record">
          <span className={`acct-outreach-status acct-outreach-status--${r.status}`}>{statusLabel(r.status)}</span>
          <div className="acct-outreach-facts">
            <span>
              <em>Owner</em> {r.assigneeNames.length ? r.assigneeNames.join(', ') : r.ownerName ?? '—'}
            </span>
            <span>
              <em>Last contacted</em> {fmtDate(r.lastContactedAt)}
            </span>
            <span>
              <em>Next follow-up</em> {fmtDate(r.nextFollowUpAt)}
            </span>
            {helpLabel(r.howCanWeHelp) ? (
              <span>
                <em>Interest</em> {helpLabel(r.howCanWeHelp)}
              </span>
            ) : null}
          </div>
        </div>
      ))}

      {activity.length ? (
        <ul className="acct-outreach-log">
          {activity.map((a) => {
            const text = a.legacy ? legacyNoteText(a.note) : a.note;
            return (
              <li key={a.id}>
                <div className="acct-outreach-log-head">
                  <strong>{a.status ? statusLabel(a.status) : 'Outreach update'}</strong>
                  <span>
                    {a.authorName ?? 'Team'} · {fmtDate(a.createdAt)}
                  </span>
                </div>
                {text ? <p>{text}</p> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
