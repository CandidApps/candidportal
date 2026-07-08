'use client';

import { dealKey } from '@/lib/bmw/deal-key';
import { getAddedDeal } from '@/lib/bmw/added-deals';
import { agentCommIdForDeal, commissionRateForAgent } from '@/lib/bmw/agent-comm-history';
import { commissionRowCustomer, matchDealToCommissionRow } from '@/lib/bmw/commission-match';
import { resolveAgentDisplayName } from '@/lib/bmw/deal-master';
import { paySourceForSupplier } from '@/lib/bmw/pay-source-map';
import {
  commissionSourceKey,
  canonicalPaySource,
} from '@/lib/commission-partners';
import type { PartnerSupplierRecord } from '@/lib/bank-deposits/source-match';
import {
  commissionRowAmountForBatch,
  type SupplierId,
  type SupplierImportBatch,
} from '@/lib/commissions/supplier-config';
import {
  dealsForCommissionSource,
  paySourceVerifiedRows,
} from '@/lib/commissions/verify-commissions';

export const COMMISSION_MATCH_TOLERANCE = 0.02;
const MATCH_TOLERANCE = COMMISSION_MATCH_TOLERANCE;
const EXCLUSIONS_KEY = 'candid-payout-exclusions';

export type EscalationLine = {
  dealUid: string;
  merchant: string;
  agentCommId: string | null;
  agentName: string;
  reportAmount: number;
  agentPayout: number;
  commissionRate: number;
  matched: boolean;
};

export type PayoutExclusionEntry = {
  supplierId: SupplierId;
  period: string;
  dealUids: string[];
  commissionTotal: number;
  depositTotal: number;
  shortfall: number;
  excludedAt: string;
};

function exclusionKey(supplierId: SupplierId, period: string): string {
  return `${supplierId}::${period}`;
}

function readExclusions(): PayoutExclusionEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(EXCLUSIONS_KEY);
    return raw ? (JSON.parse(raw) as PayoutExclusionEntry[]) : [];
  } catch {
    return [];
  }
}

function writeExclusions(entries: PayoutExclusionEntry[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(EXCLUSIONS_KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event('candid-commissions-updated'));
}

export function commissionUnderpaid(
  commissionTotal: number,
  depositTotal: number | null | undefined,
  hasCommissionImport: boolean,
): boolean {
  if (!hasCommissionImport || commissionTotal <= MATCH_TOLERANCE) return false;
  const paid = depositTotal ?? 0;
  return commissionTotal - paid > MATCH_TOLERANCE;
}

/** Pay-source rows (e.g. Linked2Pay) with no deposit — allow escalation to the pay source. */
export function paySourceNeedsEscalation(
  commissionTotal: number,
  depositTotal: number | null | undefined,
): boolean {
  const paid = depositTotal ?? 0;
  if (paid > MATCH_TOLERANCE) {
    return commissionTotal - paid > MATCH_TOLERANCE;
  }
  return true;
}

export function isPayoutExcluded(supplierId: SupplierId, period: string): boolean {
  const key = exclusionKey(supplierId, period);
  return readExclusions().some((e) => exclusionKey(e.supplierId, e.period) === key);
}

export function isDealExcludedFromPayout(
  supplierId: SupplierId,
  period: string,
  dealUid: string,
): boolean {
  const entry = readExclusions().find(
    (e) => exclusionKey(e.supplierId, e.period) === exclusionKey(supplierId, period),
  );
  if (!entry) return false;
  return entry.dealUids.includes(dealUid);
}

export function excludeSupplierPayout(entry: PayoutExclusionEntry): void {
  const key = exclusionKey(entry.supplierId, entry.period);
  const all = readExclusions().filter(
    (e) => exclusionKey(e.supplierId, e.period) !== key,
  );
  all.push(entry);
  writeExclusions(all);
}

function rowToEscalationLine(
  supplierId: SupplierId,
  period: string,
  row: Record<string, unknown>,
  amount: number,
): EscalationLine {
  const deal = matchDealToCommissionRow(supplierId, row);
  const merchant = deal?.merchant ?? commissionRowCustomer(row) ?? 'Unknown merchant';
  const dealUid = deal?.dealUid ?? '';
  const agentCommId = deal ? agentCommIdForDeal(deal, period) : null;
  const added = deal ? getAddedDeal(supplierId, deal.dealUid) : null;
  const ratePct = agentCommId
    ? (added?.commissionRate ?? commissionRateForAgent(agentCommId, period))
    : 0;
  const agentPayout = agentCommId
    ? Math.round(amount * (ratePct / 100) * 100) / 100
    : 0;

  return {
    dealUid,
    merchant,
    agentCommId,
    agentName: agentCommId ? resolveAgentDisplayName(agentCommId) : '—',
    reportAmount: amount,
    agentPayout,
    commissionRate: ratePct,
    matched: Boolean(deal),
  };
}

export function buildEscalationLines(
  supplierId: SupplierId,
  period: string,
  imports: SupplierImportBatch[],
): EscalationLine[] {
  const batches = imports.filter((b) => b.supplier === supplierId && b.period === period);
  const lines: EscalationLine[] = [];

  for (const batch of batches) {
    for (const row of batch.rows) {
      const amount = commissionRowAmountForBatch(batch, row);
      if (amount === 0) continue;
      lines.push(rowToEscalationLine(supplierId, period, row, amount));
    }
  }

  return lines.sort((a, b) =>
    a.merchant.localeCompare(b.merchant, undefined, { sensitivity: 'base' }),
  );
}

export function buildPaySourceEscalationLines(
  sourceKey: string,
  sourceLabel: string,
  period: string,
  imports: SupplierImportBatch[],
): EscalationLine[] {
  const verified = paySourceVerifiedRows(sourceKey, period);
  if (verified.length) {
    return verified
      .map((line) => ({
        dealUid: line.dealUid,
        merchant: line.merchant,
        agentCommId: null,
        agentName: '—',
        reportAmount: line.amount,
        agentPayout: 0,
        commissionRate: 0,
        matched: true,
      }))
      .sort((a, b) =>
        a.merchant.localeCompare(b.merchant, undefined, { sensitivity: 'base' }),
      );
  }

  const deals = dealsForCommissionSource(sourceLabel);
  const dealKeys = new Set(deals.map((deal) => dealKey(deal)));
  const seen = new Set<string>();
  const lines: EscalationLine[] = [];

  const batches = [...imports].sort((a, b) => b.period.localeCompare(a.period));
  for (const batch of batches) {
    for (const row of batch.rows) {
      const deal = matchDealToCommissionRow(batch.supplier, row);
      if (!deal || !dealKeys.has(dealKey(deal))) continue;
      const key = dealKey(deal);
      if (seen.has(key)) continue;
      const amount = commissionRowAmountForBatch(batch, row);
      if (amount === 0) continue;
      seen.add(key);
      lines.push(rowToEscalationLine(batch.supplier, batch.period, row, amount));
    }
  }

  for (const deal of deals) {
    const key = dealKey(deal);
    if (seen.has(key)) continue;
    lines.push({
      dealUid: deal.dealUid,
      merchant: deal.merchant,
      agentCommId: null,
      agentName: '—',
      reportAmount: 0,
      agentPayout: 0,
      commissionRate: 0,
      matched: true,
    });
  }

  return lines.sort((a, b) =>
    a.merchant.localeCompare(b.merchant, undefined, { sensitivity: 'base' }),
  );
}

export function findPartnerForSupplier(
  partners: PartnerSupplierRecord[],
  supplierId: SupplierId,
): PartnerSupplierRecord | null {
  return partners.find((p) => p.supplier_key === supplierId) ?? null;
}

export function findPartnerForPaySource(
  partners: PartnerSupplierRecord[],
  paySource: string,
): PartnerSupplierRecord | null {
  const key = commissionSourceKey(paySource);
  return (
    partners.find((p) => commissionSourceKey(p.display_name ?? p.name) === key) ??
    partners.find((p) => p.bank_source_aliases.some((a) => commissionSourceKey(a) === key)) ??
    partners.find((p) => p.supplier_key && commissionSourceKey(p.name) === key) ??
    null
  );
}

export function buildEscalationEmailBody(opts: {
  supplierLabel: string;
  paySourceLabel: string;
  periodLabel: string;
  commissionTotal: number;
  depositTotal: number;
  shortfall: number;
  lines: EscalationLine[];
}): { subject: string; body: string } {
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  const lineText = opts.lines
    .slice(0, 25)
    .map(
      (l) =>
        `• ${l.merchant}${l.dealUid ? ` (${l.dealUid})` : ''}: ${fmt(l.reportAmount)} reported`,
    )
    .join('\n');

  const subject = `Commission shortfall — ${opts.supplierLabel} — ${opts.periodLabel}`;
  const body = [
    `Hello,`,
    ``,
    `Our commission report for ${opts.periodLabel} shows ${fmt(opts.commissionTotal)} owed from ${opts.supplierLabel} (pay source: ${opts.paySourceLabel}), but we received ${fmt(opts.depositTotal)} in bank deposits.`,
    ``,
    `Outstanding amount: ${fmt(opts.shortfall)}`,
    ``,
    `Reported line items:`,
    lineText || '• (no line detail)',
    opts.lines.length > 25 ? `\n…and ${opts.lines.length - 25} more lines` : '',
    ``,
    `Please review and advise on timing for the missing payment.`,
    ``,
    `Thank you,`,
    `Candid Commissions`,
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, body };
}

export function mailtoLink(email: string, subject: string, body: string): string {
  const params = new URLSearchParams({ subject, body });
  return `mailto:${email}?${params.toString()}`;
}

export function paySourceLabelForSupplier(supplierId: SupplierId): string {
  return canonicalPaySource(paySourceForSupplier(supplierId));
}
