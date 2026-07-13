'use client';

import { useState } from 'react';
import { AgentsView } from '@/components/AgentsView';
import { TeamView } from '@/components/team/TeamView';

const BRAND = {
  red: 'var(--red)',
  grayDark: 'var(--gray-dark)',
  gray: 'var(--gray)',
  grayBorder: 'var(--gray-border)',
} as const;

const HubTabBtn: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({
  label,
  active,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      background: 'none',
      border: 'none',
      borderBottom: active ? `2px solid ${BRAND.red}` : '2px solid transparent',
      padding: '10px 16px',
      fontFamily: 'var(--font-sans)',
      fontSize: 14,
      fontWeight: active ? 600 : 500,
      color: active ? BRAND.grayDark : BRAND.gray,
      cursor: 'pointer',
      marginBottom: -1,
    }}
  >
    {label}
  </button>
);

type HubTab = 'agents' | 'team';

export function PartnersHubView({
  onSelectCustomer,
}: {
  onSelectCustomer?: (customerId: string) => void;
}) {
  const [tab, setTab] = useState<HubTab>('agents');

  return (
    <div>
      <div
        style={{
          display: 'flex',
          borderBottom: `1px solid ${BRAND.grayBorder}`,
          marginBottom: 16,
          gap: 4,
        }}
      >
        <HubTabBtn
          label="External agents"
          active={tab === 'agents'}
          onClick={() => setTab('agents')}
        />
        <HubTabBtn label="Internal team" active={tab === 'team'} onClick={() => setTab('team')} />
      </div>

      {tab === 'agents' ? (
        <AgentsView onSelectCustomer={onSelectCustomer} />
      ) : (
        <TeamView onSelectCustomer={onSelectCustomer} />
      )}
    </div>
  );
}
