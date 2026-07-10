'use client';

import { dealKey, normalizeUid } from '@/lib/bmw/deal-key';
import {
  addedDealToBmwDeal,
  getAddedDeal,
  getAddedDeals,
  persistCommissionDeal,
  type CommissionDealType,
} from '@/lib/bmw/added-deals';
import { canonicalPaySource, commissionSourceKey, dealsForPaySource } from '@/lib/commission-partners';
import { paySourceForSupplier } from '@/lib/bmw/pay-source-map';
import { commissionRowUid, matchDealToCommissionRow } from '@/lib/bmw/commission-match';
import type { BmwDeal } from '@/lib/bmw/types';
import {
  amountFieldForSupplier,
  type SupplierId,
  type SupplierImportBatch,
} from '@/lib/commissions/supplier-config';
import { saveManualImport } from '@/lib/commissions/manual-imports';
import { lastKnownCommissionByDeal, periodCommissionByDeal } from '@/lib/commissions/deal-commission-history';

export type VerifyDealLine = {
  deal: BmwDeal;
  amount: number;
  lastKnownAmount: number | null;
  lastKnownPeriod: string | null;
  selected: boolean;
};

export type VerifyMatchSuggestion = {
  label: string;
  lines: Array<{ dealUid: string; merchant: string; amount: number }>;
};

const PAY_SOURCE_STORAGE_KEY = 'candid-verified-pay-source-commissions';

export type PaySourceVerifiedEntry = {
  sourceKey: string;
  sourceLabel: string;
  period: string;
  depositAmount: number;
  lines: Array<{ dealUid: string; merchant: string; amount: number }>;
  verifiedAt: string;
};

function readPaySourceVerified(): PaySourceVerifiedEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PAY_SOURCE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PaySourceVerifiedEntry[]) : [];
  } catch {
    return [];
  }
}

export function savePaySourceVerified(entry: PaySourceVerifiedEntry): void {
  const normalized: PaySourceVerifiedEntry = {
    ...entry,
    sourceKey: commissionSourceKey(entry.sourceKey),
    sourceLabel: canonicalPaySource(entry.sourceLabel),
  };
  const all = readPaySourceVerified().filter(
    (e) =>
      !(
        commissionSourceKey(e.sourceKey) === normalized.sourceKey
        && e.period === normalized.period
      ),
  );
  all.push(normalized);
  localStorage.setItem(PAY_SOURCE_STORAGE_KEY, JSON.stringify(all));
  window.dispatchEvent(new Event('candid-commissions-updated'));
}

export function paySourcePeriodTotal(sourceKey: string, period: string): number {
  const key = commissionSourceKey(sourceKey);
  const entry = readPaySourceVerified().find(
    (e) => commissionSourceKey(e.sourceKey) === key && e.period === period,
  );
  if (!entry) return 0;
  return Math.round(entry.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
}

export function paySourceVerifiedRows(
  sourceKey: string,
  period: string,
): PaySourceVerifiedEntry['lines'] {
  const key = commissionSourceKey(sourceKey);
  return readPaySourceVerified().find(
    (e) => commissionSourceKey(e.sourceKey) === key && e.period === period,
  )?.lines ?? [];
}

export function paySourceVerifiedEntriesForPeriod(period: string): PaySourceVerifiedEntry[] {
  return readPaySourceVerified().filter((e) => e.period === period);
}

export function dealsForCommissionSource(
  paySourceLabel: string,
  activeOnly = false,
): BmwDeal[] {
  const key = commissionSourceKey(paySourceLabel);
  const fromBmw = dealsForPaySource(paySourceLabel);
  const fromAdded = getAddedDeals()
    .filter((d) => {
      const ps = d.paySource ?? (d.supplier ? paySourceForSupplier(d.supplier) : '');
      return ps && commissionSourceKey(ps) === key;
    })
    .map(addedDealToBmwDeal);

  const seen = new Set<string>();
  const merged: BmwDeal[] = [];
  for (const deal of [...fromBmw, ...fromAdded]) {
    const uid = deal.dealUid.trim().toLowerCase();
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    merged.push(deal);
  }

  if (!activeOnly) return merged;
  return merged.filter((d) => d.activeDeal);
}

function addedDealLatestAmount(
  deal: BmwDeal,
  supplierId: SupplierId | null,
  paySourceLabel: string,
): number | null {
  const psKey = commissionSourceKey(paySourceLabel);
  const uid = normalizeUid(deal.dealUid);

  if (supplierId) {
    const direct = getAddedDeal(supplierId, deal.dealUid)?.latestCommissionAmount;
    if (direct != null && direct > 0) return direct;
  }

  const added = getAddedDeals().find((d) => {
    const ps = d.paySource ?? (d.supplier ? paySourceForSupplier(d.supplier) : '');
    if (!ps || commissionSourceKey(ps) !== psKey) return false;
    if (supplierId && d.supplier && d.supplier !== supplierId) return false;
    return normalizeUid(d.dealUid) === uid;
  });
  return added?.latestCommissionAmount ?? null;
}

function verifiedPaySourceAmounts(
  sourceKey: string,
  period: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of paySourceVerifiedRows(sourceKey, period)) {
    const uid = normalizeUid(line.dealUid);
    if (!uid) continue;
    out.set(uid, roundMoney((out.get(uid) ?? 0) + line.amount));
  }
  return out;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildVerifyDealLines(
  paySourceLabel: string,
  imports: SupplierImportBatch[],
  supplierId: SupplierId | null,
  period: string,
  sourceKey?: string,
  activeOnly = false,
): VerifyDealLine[] {
  const periodAmounts = supplierId
    ? periodCommissionByDeal(imports, supplierId, period)
    : new Map<string, number>();
  const history = lastKnownCommissionByDeal(imports, supplierId);
  const verifiedByUid = !supplierId && sourceKey
    ? verifiedPaySourceAmounts(sourceKey, period)
    : new Map<string, number>();
  const deals = dealsForCommissionSource(paySourceLabel, activeOnly);

  return deals.map((deal) => {
    const key = dealKey(deal);
    const uid = normalizeUid(deal.dealUid);
    const resolvedAmount =
      periodAmounts.get(key) ??
      verifiedByUid.get(uid) ??
      history.get(key)?.amount ??
      addedDealLatestAmount(deal, supplierId, paySourceLabel) ??
      null;
    const fromVerified = !supplierId && verifiedByUid.has(uid);
    return {
      deal,
      amount: resolvedAmount ?? 0,
      lastKnownAmount: resolvedAmount,
      lastKnownPeriod: history.get(key)?.period ?? (fromVerified ? period : null),
      selected: fromVerified,
    };
  });
}

export function applyReportAmountsToLines(
  lines: VerifyDealLine[],
  imports: SupplierImportBatch[],
  supplierId: SupplierId,
  period: string,
): VerifyDealLine[] {
  const periodAmounts = periodCommissionByDeal(imports, supplierId, period);
  return lines.map((line) => {
    const key = dealKey(line.deal);
    const amt = periodAmounts.get(key);
    if (amt == null || amt <= 0) {
      return { ...line, selected: false, amount: line.lastKnownAmount ?? 0 };
    }
    return { ...line, selected: true, amount: amt, lastKnownAmount: amt };
  });
}

export function supplierReportTotalForPeriod(
  imports: SupplierImportBatch[],
  supplierId: SupplierId,
  period: string,
): number {
  return roundMoney(
    imports
      .filter((b) => b.supplier === supplierId && b.period === period)
      .reduce((sum, b) => sum + b.totalAmount, 0),
  );
}

const CENTS = 100;

function amountsEqual(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) <= tolerance;
}

/** Find subsets of deals with known amounts that sum to the deposit (up to maxResults). */
export function findDepositMatchSuggestions(
  lines: VerifyDealLine[],
  depositAmount: number,
  maxResults = 8,
): VerifyMatchSuggestion[] {
  const withAmounts = lines.filter((l) => l.lastKnownAmount != null && l.lastKnownAmount > 0);
  const results: VerifyMatchSuggestion[] = [];
  const seen = new Set<string>();

  const tryAdd = (picked: VerifyDealLine[]) => {
    const sum = picked.reduce((s, l) => s + (l.lastKnownAmount ?? 0), 0);
    if (!amountsEqual(sum, depositAmount)) return;
    const ids = picked.map((l) => l.deal.dealUid).sort().join('|');
    if (seen.has(ids)) return;
    seen.add(ids);
    results.push({
      label: picked.length === 1
        ? `${picked[0]!.deal.dealUid} · ${picked[0]!.deal.merchant}`
        : `${picked.length} deals`,
      lines: picked.map((l) => ({
        dealUid: l.deal.dealUid,
        merchant: l.deal.merchant,
        amount: l.lastKnownAmount ?? 0,
      })),
    });
  };

  // Single-deal exact match on last known amount
  for (const line of withAmounts) {
    if (amountsEqual(line.lastKnownAmount!, depositAmount)) {
      tryAdd([line]);
    }
  }

  // Subset search (deals with history only)
  const n = withAmounts.length;
  if (n <= 20) {
    for (let mask = 1; mask < 1 << n; mask += 1) {
      const picked: VerifyDealLine[] = [];
      for (let i = 0; i < n; i += 1) {
        if (mask & (1 << i)) picked.push(withAmounts[i]!);
      }
      if (picked.length < 2) continue;
      tryAdd(picked);
      if (results.length >= maxResults) break;
    }
  }

  // When only one deal exists for this source, suggest assigning the full deposit
  if (lines.length === 1 && results.length === 0) {
    const only = lines[0]!;
    results.push({
      label: `${only.deal.dealUid} · ${only.deal.merchant}`,
      lines: [{ dealUid: only.deal.dealUid, merchant: only.deal.merchant, amount: depositAmount }],
    });
  }

  return results.slice(0, maxResults);
}

function primaryUidField(supplier: SupplierId): string {
  const fields: Record<SupplierId, string> = {
    paymentcloud: 'MID',
    payjunction: 'mid',
    cardconnect: 'mid',
    appdirect: 'Account Number',
    intelisys: 'customer',
    telarus: 'customer',
    sandlerpartners: 'customer',
    nuvei: 'mid',
    checkcommerce: 'mid',
    vendara: 'merchant_mid',
    mango: 'account_num',
    weave: 'partner_object_name',
  };
  return fields[supplier] ?? 'deal_uid';
}

export async function persistVerifiedMatch({
  supplierId,
  sourceKey,
  sourceLabel,
  period,
  depositAmount,
  lines,
  saveLinesAsDeals = false,
  dealMeta,
}: {
  supplierId: SupplierId | null;
  sourceKey: string;
  sourceLabel: string;
  period: string;
  depositAmount: number;
  lines: Array<{ dealUid: string; merchant: string; amount: number }>;
  /** When true, persist each line as an added deal for future matching. */
  saveLinesAsDeals?: boolean;
  dealMeta?: Record<
    string,
    {
      agentCommId: string;
      agentName: string;
      commissionRate: number;
      commissionType?: CommissionDealType;
    }
  >;
}): Promise<void> {
  const total = Math.round(lines.reduce((s, l) => s + l.amount, 0) * CENTS) / CENTS;
  if (total <= 0) {
    throw new Error('Select at least one deal with a commission amount.');
  }
  // Allow report totals above or below the deposit — variance is resolved in Reconcile.

  if (saveLinesAsDeals && dealMeta) {
    await Promise.all(
      lines.map(async (line) => {
        const meta = dealMeta[line.dealUid];
        if (!meta?.agentCommId) return;
        await persistCommissionDeal({
          supplier: supplierId ?? undefined,
          paySource: supplierId ? undefined : canonicalPaySource(sourceLabel),
          dealUid: line.dealUid,
          merchant: line.merchant,
          agentCommId: meta.agentCommId,
          agentName: meta.agentName,
          commissionRate: meta.commissionRate,
          commissionType: meta.commissionType,
          latestCommissionAmount: line.amount > 0 ? line.amount : undefined,
        });
      }),
    );
  }

  if (supplierId) {
    const amountField = amountFieldForSupplier(supplierId);
    const uidField = primaryUidField(supplierId);
    const rows: Record<string, unknown>[] = lines.map((line) => ({
      [uidField]: line.dealUid,
      customer: line.merchant,
      [amountField]: line.amount,
      verified_match: true,
    }));

    await saveManualImport({
      supplier: supplierId,
      period,
      amountField,
      filename: `verified-match-${period}`,
      importedAt: new Date().toISOString(),
      rows,
    });
    return;
  }

  savePaySourceVerified({
    sourceKey,
    sourceLabel,
    period,
    depositAmount,
    lines,
    verifiedAt: new Date().toISOString(),
  });
}

/** Pay-source verified totals merged into supplier commission display for deposit-only sources. */
export function mergePaySourceVerifiedIntoTotals(
  sourceKey: string,
  period: string,
  dbTotal: number,
): number {
  if (dbTotal !== 0) return dbTotal;
  return paySourcePeriodTotal(sourceKey, period);
}

/** Reconcile a manual import row back to a deal when expanding supplier detail. */
export function matchVerifiedRowToDeal(
  supplier: SupplierId,
  row: Record<string, unknown>,
): BmwDeal | null {
  if (row.verified_match) {
    return matchDealToCommissionRow(supplier, row);
  }
  return null;
}

export function commissionRowDealUid(supplier: SupplierId, row: Record<string, unknown>): string {
  return commissionRowUid(supplier, row) || String(row.deal_uid ?? '');
}
