'use client';

import { useEffect, useState } from 'react';
import type { AdminReferralClick } from '@/app/api/admin/solution-providers/referrals/route';

const RESPONSE_LABEL: Record<NonNullable<AdminReferralClick['response']>, string> = {
  signed_up: 'Signed up',
  not_yet: 'Not yet',
  no: 'No',
};

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Admin view of Order here clicks and member sign-up answers for one referral supplier. */
export function SupplierReferralActivity({ providerDbId }: { providerDbId?: number }) {
  const [clicks, setClicks] = useState<AdminReferralClick[] | null>(null);

  useEffect(() => {
    if (!providerDbId) return;
    let cancelled = false;
    void fetch(`/api/admin/solution-providers/referrals?providerId=${providerDbId}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { clicks: [] }))
      .then((j: { clicks?: AdminReferralClick[] }) => {
        if (!cancelled) setClicks(j.clicks ?? []);
      })
      .catch(() => {
        if (!cancelled) setClicks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [providerDbId]);

  if (!providerDbId) return null;

  const signedUp = clicks?.filter((c) => c.response === 'signed_up').length ?? 0;

  return (
    <div className="supplier-referral-activity">
      <div className="supplier-referral-activity-head">
        <strong>Referral activity</strong>
        {clicks && (
          <span>
            {clicks.length} click{clicks.length === 1 ? '' : 's'} · {signedUp} confirmed sign-up
            {signedUp === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {clicks === null ? (
        <p className="supplier-referral-activity-empty">Loading…</p>
      ) : clicks.length === 0 ? (
        <p className="supplier-referral-activity-empty">No member clicks yet.</p>
      ) : (
        <table className="supplier-referral-activity-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Clicked</th>
              <th>Answer</th>
              <th>Tracking id</th>
            </tr>
          </thead>
          <tbody>
            {clicks.map((c) => (
              <tr key={c.id}>
                <td>{c.customerName ?? c.customerExternalId ?? 'Unknown'}</td>
                <td>{shortDate(c.clickedAt)}</td>
                <td>
                  {c.response ? (
                    <span className={`supplier-referral-answer is-${c.response}`}>
                      {RESPONSE_LABEL[c.response]}
                      {c.response !== 'not_yet' && c.respondedAt ? ` · ${shortDate(c.respondedAt)}` : ''}
                    </span>
                  ) : (
                    <span className="supplier-referral-answer">Awaiting answer</span>
                  )}
                </td>
                <td>
                  <code>{c.trackingId}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
