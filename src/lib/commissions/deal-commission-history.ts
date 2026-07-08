import { matchDealToCommissionRow, commissionRowUid } from '@/lib/bmw/commission-match';
import { addedDealToBmwDeal, getAddedDeals } from '@/lib/bmw/added-deals';
import { dealKey, normalizeUid } from '@/lib/bmw/deal-key';
import type { BmwDeal } from '@/lib/bmw/types';
import {
  commissionRowAmountForBatch,
  type SupplierId,
  type SupplierImportBatch,
} from '@/lib/commissions/supplier-config';

/** Commission $ per deal for a specific supplier import period (sums duplicate rows). */
export function periodCommissionByDeal(
  imports: SupplierImportBatch[],
  supplier: SupplierId,
  period: string,
): Map<string, number> {
  const out = new Map<string, number>();
  const batches = imports.filter((b) => b.supplier === supplier && b.period === period);

  for (const batch of batches) {
    const rowMatchOpts = { uidField: batch.uidField, customerField: batch.customerField };
    for (const row of batch.rows) {
      const amount = commissionRowAmountForBatch(batch, row);
      if (amount === 0) continue;

      const deal = matchDealToCommissionRow(supplier, row, rowMatchOpts);
      if (!deal) {
        const uid = normalizeUid(commissionRowUid(supplier, row, rowMatchOpts));
        const added = getAddedDeals().find(
          (d) => d.supplier === supplier && normalizeUid(d.dealUid) === uid,
        );
        if (!added) continue;
        const key = dealKey(addedDealToBmwDeal(added));
        out.set(key, roundMoney((out.get(key) ?? 0) + amount));
        continue;
      }

      const key = dealKey(deal);
      out.set(key, roundMoney((out.get(key) ?? 0) + amount));
    }
  }

  return out;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Last known commission amount per deal from imported supplier reports. */
export function lastKnownCommissionByDeal(
  imports: SupplierImportBatch[],
  supplier: SupplierId | null,
): Map<string, { amount: number; period: string }> {
  const out = new Map<string, { amount: number; period: string }>();
  if (!supplier) return out;

  const batches = imports
    .filter((b) => b.supplier === supplier)
    .sort((a, b) => b.period.localeCompare(a.period));

  for (const batch of batches) {
    const rowMatchOpts = { uidField: batch.uidField, customerField: batch.customerField };
    for (const row of batch.rows) {
      const deal = matchDealToCommissionRow(supplier, row, rowMatchOpts);
      if (!deal) continue;
      const key = dealKey(deal);
      if (out.has(key)) continue;
      const amount = commissionRowAmountForBatch(batch, row);
      if (amount === 0) continue;
      out.set(key, { amount, period: batch.period });
    }
  }

  return out;
}

export function dealCommissionKey(deal: BmwDeal): string {
  return dealKey(deal);
}
