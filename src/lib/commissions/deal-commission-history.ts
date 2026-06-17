import { matchDealToCommissionRow } from '@/lib/bmw/commission-match';
import { dealKey } from '@/lib/bmw/deal-key';
import type { BmwDeal } from '@/lib/bmw/types';
import {
  amountFieldForSupplier,
  type SupplierId,
  type SupplierImportBatch,
} from '@/lib/commissions/supplier-config';

function rowAmount(row: Record<string, unknown>, field: string): number {
  const v = row[field];
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Last known commission amount per deal from imported supplier reports. */
export function lastKnownCommissionByDeal(
  imports: SupplierImportBatch[],
  supplier: SupplierId | null,
): Map<string, { amount: number; period: string }> {
  const out = new Map<string, { amount: number; period: string }>();
  if (!supplier) return out;

  const amountField = amountFieldForSupplier(supplier);
  const batches = imports
    .filter((b) => b.supplier === supplier)
    .sort((a, b) => b.period.localeCompare(a.period));

  for (const batch of batches) {
    for (const row of batch.rows) {
      const deal = matchDealToCommissionRow(supplier, row);
      if (!deal) continue;
      const key = dealKey(deal);
      if (out.has(key)) continue;
      const amount = rowAmount(row, amountField);
      if (amount === 0) continue;
      out.set(key, { amount, period: batch.period });
    }
  }

  return out;
}

export function dealCommissionKey(deal: BmwDeal): string {
  return dealKey(deal);
}
