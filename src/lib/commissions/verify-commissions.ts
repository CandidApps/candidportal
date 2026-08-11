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
import { periodBefore } from '@/lib/commissions/period-utils';
import { SUPPLIER_IDS } from '@/lib/commissions/supplier-config';
import type { PaySourceVerifiedEntry } from '@/lib/commissions/verify-commissions-types';

export type { PaySourceVerifiedEntry } from '@/lib/commissions/verify-commissions-types';

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

function entryKey(entry: Pick<PaySourceVerifiedEntry, 'sourceKey' | 'period'>): string {
  return `${commissionSourceKey(entry.sourceKey)}:${entry.period}`;
}

function normalizePaySourceEntry(entry: PaySourceVerifiedEntry): PaySourceVerifiedEntry {
  return {
    ...entry,
    sourceKey: commissionSourceKey(entry.sourceKey),
    sourceLabel: canonicalPaySource(entry.sourceLabel || entry.sourceKey),
    depositAmount: Number(entry.depositAmount) || 0,
    lines: (entry.lines ?? [])
      .map((line) => ({
        dealUid: String(line.dealUid ?? '').trim(),
        merchant: String(line.merchant ?? '').trim(),
        amount: Number(line.amount) || 0,
      }))
      .filter((line) => line.dealUid),
    verifiedAt: entry.verifiedAt || new Date().toISOString(),
  };
}

function readPaySourceVerified(): PaySourceVerifiedEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PAY_SOURCE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as PaySourceVerifiedEntry[]) : [];
    return parsed.map(normalizePaySourceEntry);
  } catch {
    return [];
  }
}

function writePaySourceVerifiedLocal(entries: PaySourceVerifiedEntry[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PAY_SOURCE_STORAGE_KEY, JSON.stringify(entries.map(normalizePaySourceEntry)));
}

async function persistPaySourceVerifiedToServer(entry: PaySourceVerifiedEntry): Promise<void> {
  const res = await fetch('/api/admin/verified-pay-source-commissions', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizePaySourceEntry(entry)),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Failed to save verified pay-source (${res.status})`);
  }
}

async function fetchServerPaySourceVerified(): Promise<PaySourceVerifiedEntry[]> {
  const res = await fetch('/api/admin/verified-pay-source-commissions');
  if (!res.ok) return [];
  const body = (await res.json().catch(() => null)) as { entries?: PaySourceVerifiedEntry[] } | null;
  return (body?.entries ?? []).map(normalizePaySourceEntry);
}

function mergeLocalAndServerPaySource(
  local: PaySourceVerifiedEntry[],
  server: PaySourceVerifiedEntry[],
): PaySourceVerifiedEntry[] {
  const byKey = new Map<string, PaySourceVerifiedEntry>();
  for (const entry of local) byKey.set(entryKey(entry), entry);
  // Server wins on conflicts so multi-device / repaired rows stick after refresh.
  for (const entry of server) byKey.set(entryKey(entry), entry);
  return Array.from(byKey.values());
}

/** Save locally and persist to Supabase so verify amounts survive cache clear / logout. */
export async function savePaySourceVerified(entry: PaySourceVerifiedEntry): Promise<void> {
  const normalized = normalizePaySourceEntry(entry);
  const all = readPaySourceVerified().filter(
    (e) =>
      !(
        commissionSourceKey(e.sourceKey) === normalized.sourceKey
        && e.period === normalized.period
      ),
  );
  all.push(normalized);
  writePaySourceVerifiedLocal(all);
  await persistPaySourceVerifiedToServer(normalized);
  window.dispatchEvent(new Event('candid-commissions-updated'));
}

/** Align browser cache with Supabase, then push any local-only verified entries. */
export async function syncLocalPaySourceVerifiedToServer(): Promise<void> {
  const local = readPaySourceVerified();
  const server = await fetchServerPaySourceVerified();
  const merged = mergeLocalAndServerPaySource(local, server);
  writePaySourceVerifiedLocal(merged);

  const serverKeys = new Set(server.map(entryKey));
  const localOnly = merged.filter((entry) => !serverKeys.has(entryKey(entry)));
  if (!localOnly.length) return;
  await Promise.all(localOnly.map((entry) => persistPaySourceVerifiedToServer(entry)));
}

/**
 * When a deposit-only source has a bank deposit this period but no verified lines yet,
 * copy last month's verified deal amounts forward so you don't re-enter them each month.
 */
export async function carryForwardPaySourceVerifiedForPeriod(
  period: string,
  depositsBySourceKey: Record<string, { total: number; label?: string }>,
): Promise<number> {
  const prev = periodBefore(period);
  let carried = 0;

  for (const [rawKey, deposit] of Object.entries(depositsBySourceKey)) {
    const sourceKey = commissionSourceKey(rawKey);
    if ((SUPPLIER_IDS as string[]).includes(sourceKey)) continue;
    if (!(deposit.total > 0)) continue;
    if (paySourceVerifiedRows(sourceKey, period).length > 0) continue;

    const priorLines = paySourceVerifiedRows(sourceKey, prev);
    if (!priorLines.length) continue;

    const priorEntry = paySourceVerifiedEntriesForPeriod(prev).find(
      (e) => commissionSourceKey(e.sourceKey) === sourceKey,
    );
    await savePaySourceVerified({
      sourceKey,
      sourceLabel: deposit.label || priorEntry?.sourceLabel || rawKey,
      period,
      depositAmount: deposit.total,
      lines: priorLines.map((line) => ({ ...line })),
      verifiedAt: new Date().toISOString(),
    });
    carried += 1;
  }

  return carried;
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
  let verifiedByUid = !supplierId && sourceKey
    ? verifiedPaySourceAmounts(sourceKey, period)
    : new Map<string, number>();
  let verifiedPeriod: string | null =
    !supplierId && sourceKey && verifiedByUid.size > 0 ? period : null;

  // Prefill from last month when this period has no verified lines yet (deposit-only sources).
  if (!supplierId && sourceKey && verifiedByUid.size === 0) {
    const prior = verifiedPaySourceAmounts(sourceKey, periodBefore(period));
    if (prior.size > 0) {
      verifiedByUid = prior;
      verifiedPeriod = periodBefore(period);
    }
  }

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
      lastKnownPeriod: history.get(key)?.period ?? (fromVerified ? verifiedPeriod : null),
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
    // Intelisys reports use Account (e.g. O-32212092). customer_id is a name, not an ID.
    intelisys: 'Account',
    telarus: 'order_id',
    sandlerpartners: 'account_number',
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
      // Keep merchant on a separate key so it never overwrites the deal UID column.
      customer: line.merchant,
      [amountField]: line.amount,
      verified_match: true,
    }));

    await saveManualImport({
      supplier: supplierId,
      period,
      amountField,
      uidField,
      customerField: 'customer',
      filename: `verified-match-${period}`,
      importedAt: new Date().toISOString(),
      rows,
    });
    return;
  }

  await savePaySourceVerified({
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
