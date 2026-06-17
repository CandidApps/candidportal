'use client';

import { AppIcon } from '@/components/AppIcon';
import type { DepositMatchStatus } from '@/lib/bank-deposits/commission-reconcile';

export function DepositMatchIcon({ status }: { status: DepositMatchStatus | string }) {
  if (status === 'matched') {
    return (
      <span className="bank-match bank-match--ok" title="Deposit matches supplier commission">
        <AppIcon name="check" size={13} />
      </span>
    );
  }
  if (status === 'mismatch') {
    return (
      <span className="bank-match bank-match--warn" title="Deposit does not match supplier commission">
        <AppIcon name="warning" size={12} />
      </span>
    );
  }
  if (status === 'no_deposit') {
    return (
      <span className="bank-match bank-match--bad" title="No bank deposit for this period">
        <AppIcon name="close" size={13} />
      </span>
    );
  }
  if (status === 'no_commission_data') {
    return (
      <span className="bank-match bank-match--none" title="Deposit received but no commission reported yet">
        <span className="bank-match-dot" aria-hidden />
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span className="bank-match bank-match--pending" title="Needs classification">
        <AppIcon name="warning" size={13} />
      </span>
    );
  }
  if (status === 'na') {
    return <span className="bank-match bank-match--na" title="Not a commission deposit">—</span>;
  }
  return null;
}

const MATCH_TOLERANCE = 0.02;

export function depositMatchStatus(
  commissionTotal: number,
  depositTotal: number | null | undefined,
  hasCommissionImport: boolean,
): DepositMatchStatus {
  if (depositTotal == null) return 'no_deposit';
  if (!hasCommissionImport && commissionTotal === 0) return 'no_commission_data';
  const variance = depositTotal - commissionTotal;
  return Math.abs(variance) <= MATCH_TOLERANCE ? 'matched' : 'mismatch';
}
