'use client';

import type { TeamPayoutRow } from '@/lib/team/internal-commission-engine';

const PAYOUTS_KEY = 'candid-team-payouts';

type PayoutRecord = {
  paid: boolean;
  paidAt?: string;
  amount?: number;
};

function payoutKey(profileId: string, period: string): string {
  return `${profileId}|${period}`;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event('candid-commissions-updated'));
}

function listPayouts(): Record<string, PayoutRecord> {
  return readJson(PAYOUTS_KEY, {});
}

export type TeamPayoutRowView = TeamPayoutRow & { paid: boolean };

export function attachTeamPayoutPaidState(
  rows: TeamPayoutRow[],
  period: string,
): TeamPayoutRowView[] {
  const payouts = listPayouts();
  return rows.map((row) => ({
    ...row,
    paid: payouts[payoutKey(row.profileId, period)]?.paid ?? false,
  }));
}

export function setTeamMemberPaid(
  profileId: string,
  paid: boolean,
  period: string,
  amount?: number,
): void {
  const payouts = listPayouts();
  const key = payoutKey(profileId, period);
  if (paid) payouts[key] = { paid: true, paidAt: new Date().toISOString(), amount };
  else delete payouts[key];
  writeJson(PAYOUTS_KEY, payouts);
}

export function setAllTeamMembersPaid(
  profileIds: string[],
  paid: boolean,
  period: string,
): void {
  const payouts = listPayouts();
  for (const id of profileIds) {
    const key = payoutKey(id, period);
    if (paid) payouts[key] = { paid: true, paidAt: new Date().toISOString() };
    else delete payouts[key];
  }
  writeJson(PAYOUTS_KEY, payouts);
}

export function teamPayoutsComplete(rows: TeamPayoutRowView[]): boolean {
  const owing = rows.filter((r) => r.currentMonthOwed > 0);
  if (!owing.length) return true;
  return owing.every((r) => r.paid);
}
