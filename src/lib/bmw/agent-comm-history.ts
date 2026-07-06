'use client';

import { getBmwAgentRates, getBmwDeals } from '@/lib/bmw/deal-master';
import { dealKey } from '@/lib/bmw/deal-key';
import type { BmwDeal } from '@/lib/bmw/types';

export type PeriodSnapshot = {
  deals: Record<string, string>;
  rates: Record<string, number>;
};

type SnapshotStore = Record<string, PeriodSnapshot>;

const SNAPSHOT_KEY = 'candid-bmw-period-snapshots';
const MASTER_HASH_KEY = 'candid-bmw-master-hash';

function readSnapshots(): SnapshotStore {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? '{}') as SnapshotStore;
  } catch {
    return {};
  }
}

function writeSnapshots(store: SnapshotStore) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(store));
}

function currentMasterFingerprint(): string {
  const deals = getBmwDeals();
  return deals
    .map((d) => `${dealKey(d)}=${d.agentCommId}`)
    .sort()
    .join('|');
}

/** When deal master changes, refresh snapshot for the active period only (preserves historical months). */
export function syncCurrentPeriodSnapshot(period: string) {
  if (typeof window === 'undefined') return;
  const fp = currentMasterFingerprint();
  const prev = localStorage.getItem(MASTER_HASH_KEY);
  if (prev === fp) return;
  localStorage.setItem(MASTER_HASH_KEY, fp);

  const store = readSnapshots();
  store[period] = buildSnapshotFromMaster();
  writeSnapshots(store);
}

function buildSnapshotFromMaster(): PeriodSnapshot {
  const deals: Record<string, string> = {};
  for (const deal of getBmwDeals()) {
    if (!deal.agentCommId) continue;
    deals[dealKey(deal)] = deal.agentCommId;
  }

  const rates: Record<string, number> = {};
  for (const rate of getBmwAgentRates()) {
    rates[rate.id] = effectiveCommissionRate(rate);
  }

  return { deals, rates };
}

export function effectiveCommissionRate(rate: {
  commissionRate: number;
  tempRate: number | null;
  tempRateEndDate: string;
}): number {
  if (rate.tempRate != null && rate.tempRateEndDate) {
    const end = new Date(rate.tempRateEndDate);
    if (!Number.isNaN(end.getTime()) && end >= new Date()) {
      return rate.tempRate;
    }
  }
  return rate.commissionRate;
}

export function ensurePeriodSnapshot(period: string): PeriodSnapshot {
  const store = readSnapshots();
  const existing = store[period];
  const fresh = buildSnapshotFromMaster();

  if (!existing) {
    store[period] = fresh;
    writeSnapshots(store);
    return fresh;
  }

  let changed = false;
  for (const [key, agentId] of Object.entries(fresh.deals)) {
    if (!existing.deals[key] && agentId) {
      existing.deals[key] = agentId;
      changed = true;
    }
  }
  for (const [key, rate] of Object.entries(fresh.rates)) {
    if (existing.rates[key] == null) {
      existing.rates[key] = rate;
      changed = true;
    }
  }
  if (changed) {
    store[period] = existing;
    writeSnapshots(store);
  }
  return existing;
}

export function agentCommIdForDeal(deal: BmwDeal, period: string): string {
  const snapshot = ensurePeriodSnapshot(period);
  const key = dealKey(deal);
  return snapshot.deals[key] || deal.agentCommId;
}

export function commissionRateForAgent(agentCommId: string, period: string): number {
  const snapshot = ensurePeriodSnapshot(period);
  if (snapshot.rates[agentCommId] != null) return snapshot.rates[agentCommId]!;
  const profile = getBmwAgentRates().find((r) => r.id === agentCommId);
  return profile ? effectiveCommissionRate(profile) : 0;
}
