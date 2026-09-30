import { formatMemberEarningsBadge, formatMemberEarningsSentence } from '@/lib/member-earnings-profile';
import type { MergedSolutionSupplier } from '@/lib/solutions/supplier-matrix';

export function supplierEarningsCopy(supplier: MergedSolutionSupplier): string | null {
  if (supplier.earningsCopy?.trim()) return supplier.earningsCopy.trim();
  return formatMemberEarningsSentence(supplier.earningsProfile);
}

export function supplierEarningsBadge(supplier: MergedSolutionSupplier): string | null {
  const fromProfile = formatMemberEarningsBadge(supplier.earningsProfile);
  if (fromProfile) return fromProfile;
  if (supplier.cashbackPct == null || !Number.isFinite(supplier.cashbackPct) || supplier.cashbackPct <= 0) {
    return null;
  }
  const rounded = Math.round(supplier.cashbackPct * 10) / 10;
  return `${rounded}% cash back`;
}
