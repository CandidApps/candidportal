'use client';

import type { CSSProperties } from 'react';
import type { CandidContractRecord } from '@/lib/customer-records';
import { dealServiceBadgeHue } from '@/lib/crm/deal-service-colors';
import {
  dealServiceDisplayForCustomer,
  type DealServiceDetailBadge,
} from '@/components/customers/accounts-list-utils';

const EMPTY = <span style={{ color: 'var(--gray)' }}>—</span>;

function badgeHueStyle(baseService: string): CSSProperties {
  const { h, s } = dealServiceBadgeHue(baseService);
  return { '--ds-h': h, '--ds-s': s } as CSSProperties;
}

function BaseServiceBadge({ label }: { label: string }) {
  return (
    <span
      className="account-service-badge account-service-badge--base"
      title={label}
      style={badgeHueStyle(label)}
    >
      {label}
    </span>
  );
}

function ServiceDetailBadge({ item }: { item: DealServiceDetailBadge }) {
  return (
    <span
      className="account-service-badge account-service-badge--detail"
      title={`${item.baseService} — ${item.label}`}
      style={badgeHueStyle(item.baseService)}
    >
      {item.label}
    </span>
  );
}

export function AccountBaseServiceBadges({ contracts }: { contracts: CandidContractRecord[] }) {
  const { baseServices } = dealServiceDisplayForCustomer(contracts);
  if (!baseServices.length) return EMPTY;
  return (
    <div className="account-service-badges">
      {baseServices.map((label) => (
        <BaseServiceBadge key={label} label={label} />
      ))}
    </div>
  );
}

export function AccountServiceDetailBadges({ contracts }: { contracts: CandidContractRecord[] }) {
  const { serviceDetails } = dealServiceDisplayForCustomer(contracts);
  if (!serviceDetails.length) return EMPTY;
  return (
    <div className="account-service-badges">
      {serviceDetails.map((item) => (
        <ServiceDetailBadge key={`${item.baseService}|${item.label}`} item={item} />
      ))}
    </div>
  );
}
