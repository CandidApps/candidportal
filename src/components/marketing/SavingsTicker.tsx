'use client';

import { LIVE_SAVINGS_FEED } from '@/lib/marketing/marketplace-data';

export function SavingsTicker() {
  const items = [...LIVE_SAVINGS_FEED, ...LIVE_SAVINGS_FEED];

  return (
    <div className="mkt-savings-ticker" aria-hidden>
      <div className="mkt-savings-ticker-track">
        {items.map((item, i) => (
          <div key={`${item.vendor}-${i}`} className="mkt-savings-chip">
            <span className="mkt-savings-chip-mark" aria-hidden />
            We just saved a customer{' '}
            <strong>${item.amount.toLocaleString()}</strong> ({item.pct}%) on{' '}
            <strong>{item.vendor}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
