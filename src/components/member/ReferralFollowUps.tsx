'use client';

import { useEffect, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { SupplierLogo } from '@/components/SupplierLogo';
import {
  respondToReferralFollowUp,
  useReferralFollowUps,
  type PendingReferralFollowUp,
  type ReferralLocation,
  type ReferralResponse,
} from '@/lib/member-referral-client';

const POPUP_DISMISS_KEY = 'candid:referral-follow-up-dismissed';

function clickedLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function useRespond(onSignedUp?: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);

  const respond = async (f: PendingReferralFollowUp, response: ReferralResponse, locationId?: string) => {
    setBusy(f.clickId);
    setError(null);
    const res = await respondToReferralFollowUp(f.clickId, response, locationId);
    setBusy(null);
    if (!res.ok) {
      setError(res.error ?? 'Could not save your answer');
      return;
    }
    if (response === 'signed_up') {
      setConfirmed(f.supplierName);
      onSignedUp?.();
    }
  };
  return { busy, error, confirmed, setConfirmed, respond };
}

function AnswerButtons({
  followUp,
  locations,
  busy,
  onRespond,
}: {
  followUp: PendingReferralFollowUp;
  locations: ReferralLocation[];
  busy: boolean;
  onRespond: (f: PendingReferralFollowUp, r: ReferralResponse, locationId?: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [locationId, setLocationId] = useState('');
  const needsPick = locations.length > 1;

  if (picking) {
    return (
      <div className="referral-fu-location">
        <label className="referral-fu-location-label" htmlFor={`ref-loc-${followUp.clickId}`}>
          Which location is {followUp.supplierName} for?
        </label>
        <select
          id={`ref-loc-${followUp.clickId}`}
          className="fs-page-select"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          disabled={busy}
        >
          <option value="">Select a location…</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
              {l.address ? ` — ${l.address}` : ''}
            </option>
          ))}
        </select>
        <div className="referral-fu-actions">
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !locationId}
            onClick={() => onRespond(followUp, 'signed_up', locationId)}
          >
            Confirm
          </button>
          <button type="button" className="fs-card-btn" disabled={busy} onClick={() => setPicking(false)}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="referral-fu-actions">
      <button
        type="button"
        className="btn-primary"
        disabled={busy}
        onClick={() => (needsPick ? setPicking(true) : onRespond(followUp, 'signed_up'))}
      >
        Yes, I signed up
      </button>
      <button type="button" className="fs-card-btn" disabled={busy} onClick={() => onRespond(followUp, 'not_yet')}>
        Not yet
      </button>
      <button type="button" className="fs-card-btn referral-fu-no" disabled={busy} onClick={() => onRespond(followUp, 'no')}>
        No
      </button>
    </div>
  );
}

/** Asks once per session about the oldest due referral click (24h+ after "Order here"). */
export function ReferralFollowUpPopup({ onSignedUp }: { onSignedUp?: () => void }) {
  const { items, locations } = useReferralFollowUps();
  const { busy, error, confirmed, setConfirmed, respond } = useRespond(onSignedUp);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    try {
      setDismissed(JSON.parse(sessionStorage.getItem(POPUP_DISMISS_KEY) ?? '[]') as string[]);
    } catch {
      /* ignore */
    }
  }, []);

  const current = items.find((f) => f.due && !dismissed.includes(f.clickId));

  const dismiss = (clickId: string) => {
    const next = [...dismissed, clickId];
    setDismissed(next);
    try {
      sessionStorage.setItem(POPUP_DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  if (confirmed) {
    return (
      <div className="modal-overlay open" onClick={() => setConfirmed(null)}>
        <div className="modal-box referral-fu-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <h3 className="referral-fu-title">Thanks — we&apos;re tracking it</h3>
          <p className="referral-fu-body">
            We added {confirmed} to your services as pending. Your cash back will be applied once {confirmed} confirms
            the order.
          </p>
          <div className="referral-fu-actions">
            <button type="button" className="btn-primary" onClick={() => setConfirmed(null)}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="modal-overlay open" onClick={() => dismiss(current.clickId)}>
      <div className="modal-box referral-fu-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Close" onClick={() => dismiss(current.clickId)}>
          <AppIcon name="close" size={14} />
        </button>
        <div className="referral-fu-logo">
          <SupplierLogo
            vendor={current.supplierName}
            website={current.supplierWebsite}
            logoUrl={current.supplierLogoUrl}
            size={56}
          />
        </div>
        <h3 className="referral-fu-title">Did you sign up with {current.supplierName}?</h3>
        <p className="referral-fu-body">
          You visited {current.supplierName} through Candid on {clickedLabel(current.clickedAt)}. Let us know so we can
          make sure your cash back is applied.
        </p>
        {error && <p className="referral-fu-error">{error}</p>}
        <AnswerButtons
          key={current.clickId}
          followUp={current}
          locations={locations}
          busy={busy === current.clickId}
          onRespond={respond}
        />
      </div>
    </div>
  );
}

/** "Pending confirmation" list for My services — every open referral, due or not. */
export function ReferralPendingSection({ onSignedUp }: { onSignedUp?: () => void }) {
  const { items, locations } = useReferralFollowUps();
  const { busy, error, confirmed, respond } = useRespond(onSignedUp);

  if (items.length === 0 && !confirmed) return null;

  return (
    <section className="referral-pending" aria-label="Pending confirmation">
      <div className="referral-pending-head">
        <h3>Pending confirmation</h3>
        <p>Suppliers you visited through Candid. Confirm your sign-up so we can apply your cash back.</p>
      </div>
      {confirmed && <p className="referral-pending-ok">Thanks — {confirmed} was added to your services as pending.</p>}
      {error && <p className="referral-fu-error">{error}</p>}
      <ul className="referral-pending-list">
        {items.map((f) => (
          <li key={f.clickId} className="referral-pending-row">
            <SupplierLogo vendor={f.supplierName} website={f.supplierWebsite} logoUrl={f.supplierLogoUrl} size={36} />
            <div className="referral-pending-text">
              <strong>{f.supplierName}</strong>
              <span>Visited {clickedLabel(f.clickedAt)} · Did you sign up?</span>
            </div>
            <AnswerButtons followUp={f} locations={locations} busy={busy === f.clickId} onRespond={respond} />
          </li>
        ))}
      </ul>
    </section>
  );
}
