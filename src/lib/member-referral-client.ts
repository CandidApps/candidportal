'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type { PendingReferralFollowUp, ReferralLocation, ReferralResponse } from '@/lib/services/member-referrals';

export type { PendingReferralFollowUp, ReferralLocation, ReferralResponse };

/** Opens the cash-back interstitial in a new tab; it records the click and forwards to the supplier. */
export function openSupplierReferral(providerId: number | undefined): void {
  if (!providerId) return;
  window.open(`/go/${providerId}`, '_blank', 'noopener');
}

type State = { items: PendingReferralFollowUp[]; locations: ReferralLocation[]; loaded: boolean };

let state: State = { items: [], locations: [], loaded: false };
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

export function loadReferralFollowUps(force = false): Promise<void> {
  if (inflight) return inflight;
  if (state.loaded && !force) return Promise.resolve();
  inflight = fetch('/api/portal/referrals', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : { followUps: [] }))
    .then((j: { followUps?: PendingReferralFollowUp[]; locations?: ReferralLocation[] }) =>
      emit({ items: j.followUps ?? [], locations: j.locations ?? [], loaded: true }),
    )
    .catch(() => emit({ ...state, loaded: true }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function respondToReferralFollowUp(
  clickId: string,
  response: ReferralResponse,
  locationId?: string,
): Promise<{ ok: boolean; dealExternalId?: string | null; error?: string }> {
  const res = await fetch('/api/portal/referrals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clickId, response, locationId }),
  });
  const j = (await res.json().catch(() => ({}))) as { dealExternalId?: string | null; error?: string };
  if (!res.ok) return { ok: false, error: j.error ?? 'Could not save your answer' };
  emit({ ...state, items: state.items.filter((f) => f.clickId !== clickId) });
  if (response === 'not_yet') void loadReferralFollowUps(true);
  return { ok: true, dealExternalId: j.dealExternalId ?? null };
}

export function useReferralFollowUps(enabled = true): State {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
  useEffect(() => {
    if (enabled) void loadReferralFollowUps();
  }, [enabled]);
  return snap;
}
