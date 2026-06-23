'use client';

import { AppIcon } from '@/components/AppIcon';

/** Green check — same visual language as bank deposit match in Commissions. */
export function FeeRateMatchIcon({ title }: { title?: string }) {
  return (
    <span className="bank-match bank-match--ok" title={title ?? 'Matches a current fee on the statement'}>
      <AppIcon name="check" size={13} />
    </span>
  );
}
