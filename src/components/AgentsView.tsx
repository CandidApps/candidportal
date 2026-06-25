'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bmwRatesToAgents } from '@/lib/bmw/deal-master';
import { onAgentsUpdated } from '@/lib/agents/agent-assignments';
import { AgentDetailPage } from '@/components/agents/AgentDetailPage';
import { useCrmData } from '@/components/CrmDataProvider';

const BRAND = {
  red: 'var(--red)',
  grayDark: 'var(--gray-dark)',
  gray: 'var(--gray)',
  grayLight: 'var(--gray-light)',
  grayBorder: 'var(--gray-border)',
  white: 'var(--white)',
  green: 'var(--green)',
  amber: 'var(--amber)',
  blue: 'var(--blue)',
  onAccent: '#FFFFFF',
  headerBg: 'var(--panel-dark)',
} as const;

export type AgentStatus = 'active' | 'pending' | 'inactive';

export type AgentCustomerRef = {
  id: string;
  name: string;
  tierId?: string;
};

export type AgentCommissionTier = {
  id: string;
  label: string;
  commissionRate: number;
  baseCommissionRate: number;
  overridePartner?: string;
  overrideRate: number | null;
  tempRate: number | null;
  tempRateEndDate?: string;
  customers: AgentCustomerRef[];
};

export type Agent = {
  id: string;
  company: string;
  status: AgentStatus;
  primaryContactName: string;
  primaryContactEmail: string;
  notes?: string;
  mrc: number;
  customerCount: number;
  customers: AgentCustomerRef[];
  tiers: AgentCommissionTier[];
  tierIds: string[];
  commissionsLastMonth: number;
  commissionsYtd: number;
};

const INITIAL_AGENTS: Agent[] = [];

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

const StatusPill: React.FC<{ status: AgentStatus }> = ({ status }) => {
  const map: Record<AgentStatus, { bg: string; color: string; label: string }> = {
    active: { bg: 'var(--green-light)', color: BRAND.green, label: 'Active' },
    pending: { bg: 'var(--amber-light)', color: BRAND.amber, label: 'Pending' },
    inactive: { bg: 'var(--gray-light)', color: BRAND.gray, label: 'Inactive' },
  };
  const s = map[status];
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
      {s.label}
    </span>
  );
};

const iconBase = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const SearchIcon = () => (
  <svg {...iconBase}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const Th: React.FC<{ children: React.ReactNode; align?: 'left' | 'right' | 'center' }> = ({
  children,
  align = 'left',
}) => (
  <th
    style={{
      padding: '11px 16px',
      textAlign: align,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: BRAND.gray,
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </th>
);

const TabBtn: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      background: 'none',
      border: 'none',
      borderBottom: active ? `2px solid ${BRAND.red}` : '2px solid transparent',
      padding: '12px 14px',
      fontFamily: 'var(--font-sans)',
      fontSize: 13,
      fontWeight: active ? 600 : 500,
      color: active ? BRAND.grayDark : BRAND.gray,
      cursor: 'pointer',
      marginBottom: -1,
    }}
  >
    {label}
  </button>
);

const StatCard: React.FC<{
  label: string;
  value: string;
  sub: string;
  onClick?: () => void;
  accent?: string;
}> = ({ label, value, sub, onClick, accent }) => (
  <div
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    style={{
      background: BRAND.white,
      border: `1px solid ${BRAND.grayBorder}`,
      borderLeft: accent ? `3px solid ${accent}` : undefined,
      borderRadius: 8,
      padding: '14px 18px',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'border-color 0.15s',
    }}
  >
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: accent || BRAND.gray, marginBottom: 6 }}>
      {label}
    </div>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, color: BRAND.grayDark, letterSpacing: '-0.03em' }}>
      {value}
    </div>
    <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 2 }}>{sub}</div>
  </div>
);

function CommissionTiersCell({ tiers }: { tiers: Agent['tiers'] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!tiers.length) {
    return <span style={{ color: BRAND.gray, fontSize: 12 }}>—</span>;
  }

  if (tiers.length === 1) {
    return <span style={{ fontSize: 12 }}>{tiers[0]!.label}</span>;
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          fontSize: 12,
          color: BRAND.blue,
          background: 'none',
          border: 'none',
          borderBottom: `1px dashed ${BRAND.blue}`,
          cursor: 'pointer',
          padding: 0,
          fontWeight: 600,
        }}
      >
        {tiers.length} tiers ▾
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 'calc(100% + 6px)',
            zIndex: 120,
            background: BRAND.white,
            border: `1px solid ${BRAND.grayBorder}`,
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            minWidth: 260,
            maxWidth: 360,
            padding: 8,
          }}
        >
          {tiers.map((tier) => (
            <div key={tier.id} style={{ padding: '8px 10px', borderBottom: `1px solid ${BRAND.grayLight}` }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{tier.label}</div>
              <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 2 }}>
                {tier.customers.length} customer{tier.customers.length === 1 ? '' : 's'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomerCountCell({
  count,
  customers,
  onSelectCustomer,
}: {
  count: number;
  customers: AgentCustomerRef[];
  onSelectCustomer?: (customerId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (count <= 0) {
    return <span style={{ fontFamily: 'var(--font-mono)', color: BRAND.gray }}>0</span>;
  }

  const canOpen = customers.length > 0 && onSelectCustomer;

  return (
    <div
      ref={ref}
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => canOpen && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => canOpen && setOpen((v) => !v)}
        style={{
          fontFamily: 'var(--font-mono)',
          color: BRAND.blue,
          background: 'none',
          border: 'none',
          borderBottom: `1px dashed ${BRAND.blue}`,
          cursor: canOpen ? 'pointer' : 'default',
          padding: 0,
          fontSize: 13,
          fontWeight: 600,
        }}
        title={canOpen ? 'View customers' : undefined}
      >
        {count}
      </button>
      {open && customers.length > 0 && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            zIndex: 120,
            background: BRAND.white,
            border: `1px solid ${BRAND.grayBorder}`,
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            minWidth: 220,
            maxWidth: 320,
            maxHeight: 280,
            overflowY: 'auto',
            padding: 6,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: BRAND.gray,
              padding: '6px 10px 4px',
            }}
          >
            Customers ({customers.length})
          </div>
          {customers.map((customer) => (
            <button
              key={customer.id}
              type="button"
              onClick={() => {
                onSelectCustomer?.(customer.id);
                setOpen(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                border: 'none',
                borderRadius: 4,
                background: 'transparent',
                color: BRAND.red,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = BRAND.grayLight;
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {customer.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const AgentsView: React.FC<{
  onSelectCustomer?: (customerId: string) => void;
}> = ({ onSelectCustomer }) => {
  const { ready, agentRates } = useCrmData();
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AgentStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);

  const reloadAgents = useCallback(() => {
    if (ready && agentRates.length) {
      setAgents(bmwRatesToAgents());
    }
  }, [ready, agentRates]);

  useEffect(() => {
    reloadAgents();
  }, [reloadAgents]);

  useEffect(() => onAgentsUpdated(reloadAgents), [reloadAgents]);

  const selectedAgent = useMemo(
    () => (selectedAgentId ? agents.find((a) => a.id === selectedAgentId) ?? null : null),
    [agents, selectedAgentId],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents.filter((a) => {
      if (activeTab !== 'all' && a.status !== activeTab) return false;
      if (!q) return true;
      return (
        a.company.toLowerCase().includes(q) ||
        a.primaryContactName.toLowerCase().includes(q) ||
        a.primaryContactEmail.toLowerCase().includes(q)
      );
    });
  }, [agents, activeTab, search]);

  const stats = useMemo(
    () => ({
      all: agents.length,
      active: agents.filter((a) => a.status === 'active').length,
      pending: agents.filter((a) => a.status === 'pending').length,
      inactive: agents.filter((a) => a.status === 'inactive').length,
      totalMrc: agents.reduce((s, a) => s + a.mrc, 0),
      lastMonth: agents.reduce((s, a) => s + a.commissionsLastMonth, 0),
    }),
    [agents],
  );

  if (selectedAgent) {
    return (
      <AgentDetailPage
        agent={selectedAgent}
        onBack={() => setSelectedAgentId(null)}
        onRefresh={reloadAgents}
        onSelectCustomer={onSelectCustomer}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Total Agents" value={String(stats.all)} sub="In roster" onClick={() => setActiveTab('all')} />
        <StatCard label="Active" value={String(stats.active)} sub="Earning residuals" onClick={() => setActiveTab('active')} accent={BRAND.green} />
        <StatCard label="Portfolio MRC" value={formatCurrency(stats.totalMrc)} sub="Monthly recurring" accent={BRAND.blue} />
        <StatCard label="Paid Last Month" value={formatCurrency(stats.lastMonth)} sub="All agents" accent={BRAND.red} />
      </div>

      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${BRAND.grayBorder}`, padding: '0 20px', flexWrap: 'wrap', gap: 8 }}>
          {(
            [
              ['all', 'All'],
              ['active', 'Active'],
              ['pending', 'Pending'],
              ['inactive', 'Inactive'],
            ] as const
          ).map(([tab, label]) => (
            <TabBtn key={tab} label={label} active={activeTab === tab} onClick={() => setActiveTab(tab)} />
          ))}
          <div style={{ marginLeft: 'auto', position: 'relative', padding: '10px 0' }} ref={searchRef}>
            <div
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                color: BRAND.gray,
              }}
            >
              <SearchIcon />
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agents..."
              style={{
                padding: '8px 12px 8px 32px',
                border: `1px solid ${BRAND.grayBorder}`,
                borderRadius: 6,
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                color: BRAND.grayDark,
                width: 240,
                outline: 'none',
              }}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 960 }}>
            <thead>
              <tr style={{ background: BRAND.grayLight }}>
                <Th>Agent company</Th>
                <Th>Status</Th>
                <Th>Commission tiers</Th>
                <Th>Primary contact</Th>
                <Th align="right">MRC</Th>
                <Th align="right">Customers</Th>
                <Th align="right">Commissions (last month)</Th>
                <Th align="right">Commissions (YTD)</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: BRAND.gray }}>
                    No agents found.
                  </td>
                </tr>
              ) : (
                filtered.map((a) => (
                  <tr
                    key={a.id}
                    style={{ borderBottom: `1px solid ${BRAND.grayBorder}`, cursor: 'pointer' }}
                    onClick={() => setSelectedAgentId(a.id)}
                    onMouseOver={(e) => (e.currentTarget.style.background = BRAND.grayLight)}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ fontWeight: 600, color: BRAND.grayDark }}>{a.company}</div>
                      {a.tiers.length > 1 && (
                        <div style={{ fontSize: 10, color: BRAND.gray, marginTop: 2 }}>Merged profile</div>
                      )}
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <StatusPill status={a.status} />
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <CommissionTiersCell tiers={a.tiers} />
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ fontWeight: 500, color: BRAND.grayDark }}>{a.primaryContactName}</div>
                      <div style={{ fontSize: 11, color: BRAND.gray }}>{a.primaryContactEmail}</div>
                    </td>
                    <td style={{ padding: '13px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: BRAND.grayDark }}>
                      {formatCurrency(a.mrc)}
                    </td>
                    <td style={{ padding: '13px 16px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <CustomerCountCell
                        count={a.customerCount}
                        customers={a.customers}
                        onSelectCustomer={onSelectCustomer}
                      />
                    </td>
                    <td style={{ padding: '13px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: BRAND.green }}>
                      {formatCurrency(a.commissionsLastMonth)}
                    </td>
                    <td style={{ padding: '13px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: BRAND.grayDark }}>
                      {formatCurrency(a.commissionsYtd)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AgentsView;
