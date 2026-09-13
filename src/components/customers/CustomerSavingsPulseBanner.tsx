'use client';

import { useMemo } from 'react';
import { AppIcon } from '@/components/AppIcon';
import {
  buildCustomerRelationshipSavings,
  formatSnapshotMoney,
} from '@/lib/crm/customer-relationship-savings';

const cardStyle: React.CSSProperties = {
  marginBottom: 20,
  padding: '16px 18px',
  borderRadius: 10,
  border: '1px solid var(--gray-border)',
  background: 'var(--card-bg, #fff)',
  borderLeft: '3px solid #16a34a',
};

export function CustomerSavingsPulseBanner({
  customerId,
  accountSavings,
}: {
  customerId: string;
  accountSavings?: number | null;
}) {
  const savings = useMemo(
    () => buildCustomerRelationshipSavings(customerId, accountSavings),
    [customerId, accountSavings],
  );

  const hasData =
    savings.lifetimeMonthlySavings > 0 ||
    savings.servicesTouchedCount > 0 ||
    savings.candidManagedCount > 0;

  if (!hasData) return null;

  return (
    <div id="acct-sec-savings-pulse" style={{ ...cardStyle, scrollMarginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <AppIcon name="sparkles" size={14} />
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Relationship savings
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 4 }}>Lifetime savings</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#166534' }}>
            {savings.lifetimeMonthlySavings > 0
              ? `${formatSnapshotMoney(savings.lifetimeMonthlySavings)}/mo`
              : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
            {savings.lifetimeMonthlySavings > 0
              ? `${formatSnapshotMoney(savings.lifetimeMonthlySavings * 12)}/yr combined`
              : 'Active + past Candid services'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 4 }}>Active savings/mo</div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>
            {savings.activeMonthlySavings > 0 ? formatSnapshotMoney(savings.activeMonthlySavings) : '—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 4 }}>Past services savings</div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>
            {savings.pastServicesMonthlySavings > 0
              ? formatSnapshotMoney(savings.pastServicesMonthlySavings)
              : '—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 4 }}>Services touched</div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{savings.servicesTouchedCount}</div>
        </div>
      </div>
    </div>
  );
}
