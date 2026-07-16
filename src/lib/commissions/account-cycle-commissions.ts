import { dealKey } from '@/lib/bmw/deal-key';
import type { CandidContractRecord } from '@/lib/customer-records';
import { periodCommissionByDeal } from '@/lib/commissions/deal-commission-history';
import { periodBefore } from '@/lib/commissions/period-utils';
import { SUPPLIER_IDS, type SupplierImportBatch } from '@/lib/commissions/supplier-config';

/**
 * Commission cycle for a given date: the 16th → end of month bills the current
 * calendar month; the 1st → 15th still bills the previous month.
 */
export function commissionCyclePeriod(now: Date = new Date()): string {
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return now.getDate() > 15 ? month : periodBefore(month);
}

/** Human label like "Jul 2026" for a YYYY-MM period. */
export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/** Merge per-deal commission $ across every supplier for one period. */
export function commissionByDealForPeriod(
  imports: SupplierImportBatch[],
  period: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const supplier of SUPPLIER_IDS) {
    for (const [key, amount] of periodCommissionByDeal(imports, supplier, period)) {
      out.set(key, (out.get(key) ?? 0) + amount);
    }
  }
  return out;
}

function contractDealKey(contract: CandidContractRecord): string | null {
  if (!contract.paySource || !contract.dealId) return null;
  return dealKey({ paySource: contract.paySource, dealUid: contract.dealId });
}

/**
 * Total commission $ per account for the given period, summed from the account's
 * own deals (matched to supplier import rows). Accounts with no matched
 * commission are omitted from the result.
 */
export function commissionByAccountForPeriod(
  imports: SupplierImportBatch[],
  contractsByCustomer: Record<string, CandidContractRecord[]>,
  period: string,
): Record<string, number> {
  if (!imports.length) return {};
  const byDeal = commissionByDealForPeriod(imports, period);
  if (!byDeal.size) return {};

  const out: Record<string, number> = {};
  for (const [customerId, contracts] of Object.entries(contractsByCustomer)) {
    const seen = new Set<string>();
    let total = 0;
    for (const contract of contracts) {
      const key = contractDealKey(contract);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      total += byDeal.get(key) ?? 0;
    }
    if (total !== 0) out[customerId] = Math.round(total * 100) / 100;
  }
  return out;
}
