'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildCommissionPartnerRows,
  dealsForPaySource,
  type CommissionPartnerRow,
} from '@/lib/commission-partners';
import { parentMerchantFor } from '@/lib/bmw/deal-master';
import type { BmwDeal } from '@/lib/bmw/types';
import {
  loadSolutionProviders,
  dealsForProvider,
  type SolutionProviderRecord,
} from '@/lib/solution-providers';
import { fetchPartnerSuppliers } from '@/lib/services/bank-deposits';
import { filterCustomersForAccountTab, serviceStartForCustomer, type AccountListTab } from '@/components/customers/accounts-list-utils';
import type { CandidContractRecord } from '@/lib/customer-records';
import { bmwRatesToAgents } from '@/lib/bmw/deal-master';
import type { Agent } from '@/components/AgentsView';
import type { Customer } from '@/components/CustomersView';
import { BRAND } from '@/lib/ui/brand-tokens';

function filterCustomersByTab(
  customers: Customer[],
  tab: AccountListTab,
  contractsByCustomer: Record<string, CandidContractRecord[]>,
): Customer[] {
  return filterCustomersForAccountTab(customers, tab, contractsByCustomer);
}

function merchantMatchesCustomer(merchant: string, customer: Customer): boolean {
  const parent = parentMerchantFor(merchant.trim());
  return (
    customer.company === merchant ||
    customer.company === parent ||
    parentMerchantFor(customer.company) === parent
  );
}

function customerForDeal(customers: Customer[], deal: BmwDeal): Customer | undefined {
  return customers.find((c) => merchantMatchesCustomer(deal.merchant, c));
}

type PartnerViewsProps = {
  customers: Customer[];
  accountTab: AccountListTab;
  contractsByCustomer: Record<string, CandidContractRecord[]>;
  search: string;
  onOpenCustomer: (customerId: string) => void;
};

export function AccountsCommissionPartnerView({
  customers,
  accountTab,
  contractsByCustomer,
  search,
  onOpenCustomer,
}: PartnerViewsProps) {
  const [rows, setRows] = useState<CommissionPartnerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const partners = await fetchPartnerSuppliers();
      setRows(buildCommissionPartnerRows(partners));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredCustomers = useMemo(
    () => filterCustomersByTab(customers, accountTab, contractsByCustomer),
    [customers, accountTab, contractsByCustomer],
  );

  const q = search.trim().toLowerCase();

  const visibleRows = useMemo(() => {
    if (!q) return rows;
    return rows.filter((row) => {
      if (row.paySource.toLowerCase().includes(q)) return true;
      const deals = dealsForPaySource(row.paySource);
      return deals.some((d) => {
        const c = customerForDeal(filteredCustomers, d);
        return c && c.company.toLowerCase().includes(q);
      });
    });
  }, [rows, q, filteredCustomers]);

  if (loading) {
    return <p style={{ padding: 24, fontSize: 13, color: BRAND.gray }}>Loading commission partners…</p>;
  }

  if (!visibleRows.length) {
    return <p style={{ padding: 24, fontSize: 13, color: BRAND.gray }}>No commission partners match.</p>;
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ background: BRAND.grayLight }}>
          <th style={thStyle}>Commission partner</th>
          <th style={thStyle}>Residual import</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Accounts</th>
        </tr>
      </thead>
      <tbody>
        {visibleRows.map((row) => {
          const deals = dealsForPaySource(row.paySource);
          const linked = deals
            .map((deal) => ({ deal, customer: customerForDeal(filteredCustomers, deal) }))
            .filter((x): x is { deal: BmwDeal; customer: Customer } => Boolean(x.customer));
          const uniqueCustomers = [...new Map(linked.map((x) => [x.customer.id, x])).values()];

          if (q && uniqueCustomers.length === 0 && !row.paySource.toLowerCase().includes(q)) {
            return null;
          }

          return (
            <Fragment key={row.paySource}>
              <tr style={{ borderBottom: `1px solid ${BRAND.grayBorder}`, background: BRAND.white }}>
                <td style={{ padding: '14px 16px', fontWeight: 600, color: BRAND.grayDark }}>{row.paySource}</td>
                <td style={{ padding: '14px 16px', fontSize: 12 }}>
                  {row.hasResidualImport ? (
                    <span style={{ color: BRAND.green, fontWeight: 600 }}>Yes</span>
                  ) : (
                    <span style={{ color: BRAND.gray }}>Pay source only</span>
                  )}
                </td>
                <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  {uniqueCustomers.length}
                </td>
              </tr>
              <tr>
                <td colSpan={3} style={{ padding: 0, background: BRAND.grayLight, borderBottom: `1px solid ${BRAND.grayBorder}` }}>
                  <div style={{ padding: '14px 20px 18px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: BRAND.gray, marginBottom: 10 }}>
                      Accounts via {row.paySource}
                    </div>
                    {uniqueCustomers.length === 0 ? (
                      <p style={{ fontSize: 12, color: BRAND.gray, margin: 0 }}>No accounts in this filter.</p>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: BRAND.white, borderRadius: 6, overflow: 'hidden', border: `1px solid ${BRAND.grayBorder}` }}>
                        <thead>
                          <tr style={{ background: BRAND.grayLight }}>
                            <th style={nestedThStyle}>Account</th>
                            <th style={nestedThStyle}>Provider</th>
                            <th style={nestedThStyle}>Solution</th>
                            <th style={nestedThStyle}>Agent</th>
                            <th style={nestedThStyle}>Deal UID</th>
                          </tr>
                        </thead>
                        <tbody>
                          {linked.map(({ deal, customer }) => (
                            <tr key={`${row.paySource}-${deal.rowNum}`} style={{ borderTop: `1px solid ${BRAND.grayBorder}` }}>
                              <td style={{ padding: '10px 12px' }}>
                                <button
                                  type="button"
                                  onClick={() => onOpenCustomer(customer.id)}
                                  style={{ background: 'none', border: 'none', color: BRAND.red, fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left' }}
                                >
                                  {customer.company}
                                </button>
                              </td>
                              <td style={{ padding: '10px 12px' }}>{deal.provider || '—'}</td>
                              <td style={{ padding: '10px 12px' }}>{deal.product || deal.serviceDescription || '—'}</td>
                              <td style={{ padding: '10px 12px' }}>{customer.agent || deal.agentCommId || '—'}</td>
                              <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)' }}>{deal.dealUid || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </td>
              </tr>
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

export function AccountsSupplierVendorView({
  customers,
  accountTab,
  contractsByCustomer,
  search,
  onOpenCustomer,
}: PartnerViewsProps) {
  const [providers, setProviders] = useState<SolutionProviderRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void loadSolutionProviders().then((list) => {
      if (!cancelled) {
        setProviders(list);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredCustomers = useMemo(
    () => filterCustomersByTab(customers, accountTab, contractsByCustomer),
    [customers, accountTab, contractsByCustomer],
  );

  const q = search.trim().toLowerCase();

  const visibleProviders = useMemo(() => {
    let list = providers;
    if (!q) return list;
    return list.filter((p) => {
      const name = (p.displayName ?? p.name).toLowerCase();
      if (name.includes(q)) return true;
      return dealsForProvider(p.name).some((d) => {
        const c = customerForDeal(filteredCustomers, d);
        return c && c.company.toLowerCase().includes(q);
      });
    });
  }, [providers, q, filteredCustomers]);

  if (loading) {
    return <p style={{ padding: 24, fontSize: 13, color: BRAND.gray }}>Loading suppliers & vendors…</p>;
  }

  if (!visibleProviders.length) {
    return <p style={{ padding: 24, fontSize: 13, color: BRAND.gray }}>No suppliers match.</p>;
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ background: BRAND.grayLight }}>
          <th style={thStyle}>Supplier / vendor</th>
          <th style={thStyle}>Solutions</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Accounts</th>
        </tr>
      </thead>
      <tbody>
        {visibleProviders.map((p) => {
          const deals = dealsForProvider(p.name);
          const linked = deals
            .map((deal) => ({ deal, customer: customerForDeal(filteredCustomers, deal) }))
            .filter((x): x is { deal: BmwDeal; customer: Customer } => Boolean(x.customer));

          if (q && linked.length === 0 && !(p.displayName ?? p.name).toLowerCase().includes(q)) {
            return null;
          }

          const uniqueCount = new Set(linked.map((x) => x.customer.id)).size;

          return (
            <Fragment key={p.id}>
              <tr style={{ borderBottom: `1px solid ${BRAND.grayBorder}` }}>
                <td style={{ padding: '14px 16px', fontWeight: 600 }}>{p.displayName ?? p.name}</td>
                <td style={{ padding: '14px 16px', fontSize: 12 }}>{p.solutions.length}</td>
                <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{uniqueCount}</td>
              </tr>
              <tr>
                <td colSpan={3} style={{ padding: 0, background: BRAND.grayLight, borderBottom: `1px solid ${BRAND.grayBorder}` }}>
                  <div style={{ padding: '14px 20px 18px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: BRAND.gray, marginBottom: 10 }}>
                      Accounts on {p.displayName ?? p.name}
                    </div>
                    {linked.length === 0 ? (
                      <p style={{ fontSize: 12, color: BRAND.gray, margin: 0 }}>No accounts in this filter.</p>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: BRAND.white, borderRadius: 6, overflow: 'hidden', border: `1px solid ${BRAND.grayBorder}` }}>
                        <thead>
                          <tr style={{ background: BRAND.grayLight }}>
                            <th style={nestedThStyle}>Account</th>
                            <th style={nestedThStyle}>Product</th>
                            <th style={nestedThStyle}>Agent</th>
                            <th style={nestedThStyle}>MRC</th>
                            <th style={nestedThStyle}>Deal UID</th>
                          </tr>
                        </thead>
                        <tbody>
                          {linked.map(({ deal, customer }) => (
                            <tr key={`${p.id}-${deal.rowNum}`} style={{ borderTop: `1px solid ${BRAND.grayBorder}` }}>
                              <td style={{ padding: '10px 12px' }}>
                                <button
                                  type="button"
                                  onClick={() => onOpenCustomer(customer.id)}
                                  style={{ background: 'none', border: 'none', color: BRAND.red, fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left' }}
                                >
                                  {customer.company}
                                </button>
                              </td>
                              <td style={{ padding: '10px 12px' }}>{deal.product || deal.serviceDescription || '—'}</td>
                              <td style={{ padding: '10px 12px' }}>{customer.agent || '—'}</td>
                              <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)' }}>
                                {deal.contractMrc != null ? `$${deal.contractMrc.toLocaleString()}` : '—'}
                              </td>
                              <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)' }}>{deal.dealUid || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </td>
              </tr>
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function normalizeAgentName(name: string): string {
  return name.replace(/^\* | \*$/g, '').trim().toLowerCase();
}

function customersForAgent(agent: Agent, pool: Customer[]): Customer[] {
  const ids = new Set(agent.customers.map((c) => c.id));
  const names = new Set([
    normalizeAgentName(agent.company),
    normalizeAgentName(agent.primaryContactName),
  ]);
  return pool.filter(
    (c) => ids.has(c.id) || names.has(normalizeAgentName(c.agent || '')),
  );
}

export function AccountsAgentView({
  customers,
  accountTab,
  contractsByCustomer,
  search,
  onOpenCustomer,
}: PartnerViewsProps) {
  const agents = useMemo(() => bmwRatesToAgents(), []);

  const filteredCustomers = useMemo(
    () => filterCustomersByTab(customers, accountTab, contractsByCustomer),
    [customers, accountTab, contractsByCustomer],
  );

  const q = search.trim().toLowerCase();

  const agentRows = useMemo(() => {
    const assigned = new Set<string>();
    const rows: { key: string; label: string; customers: Customer[]; totalMrc: number }[] = [];

    for (const agent of agents) {
      const linked = customersForAgent(agent, filteredCustomers).filter((c) => {
        if (assigned.has(c.id)) return false;
        assigned.add(c.id);
        return true;
      });
      if (!linked.length) continue;
      rows.push({
        key: agent.id,
        label: agent.company.replace(/^\* | \*$/g, ''),
        customers: linked.sort((a, b) => a.company.localeCompare(b.company)),
        totalMrc: linked.reduce((s, c) => s + c.spend, 0),
      });
    }

    const unassigned = filteredCustomers.filter((c) => !assigned.has(c.id));
    if (unassigned.length) {
      rows.push({
        key: 'unassigned',
        label: 'Unassigned',
        customers: unassigned.sort((a, b) => a.company.localeCompare(b.company)),
        totalMrc: unassigned.reduce((s, c) => s + c.spend, 0),
      });
    }

    if (!q) return rows;
    return rows.filter((row) => {
      if (row.label.toLowerCase().includes(q)) return true;
      return row.customers.some((c) => c.company.toLowerCase().includes(q));
    });
  }, [agents, filteredCustomers, q]);

  if (!agentRows.length) {
    return <p style={{ padding: 24, fontSize: 13, color: BRAND.gray }}>No agents match this filter.</p>;
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ background: BRAND.grayLight }}>
          <th style={thStyle}>Agent</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Accounts</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Total MRC</th>
        </tr>
      </thead>
      <tbody>
        {agentRows.map((row) => (
          <Fragment key={row.key}>
            <tr style={{ borderBottom: `1px solid ${BRAND.grayBorder}`, background: BRAND.white }}>
              <td style={{ padding: '14px 16px', fontWeight: 600, color: BRAND.grayDark }}>{row.label}</td>
              <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                {row.customers.length}
              </td>
              <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {row.totalMrc > 0 ? `$${row.totalMrc.toLocaleString()}/mo` : '—'}
              </td>
            </tr>
            <tr>
              <td colSpan={3} style={{ padding: 0, background: BRAND.grayLight, borderBottom: `1px solid ${BRAND.grayBorder}` }}>
                <div style={{ padding: '14px 20px 18px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: BRAND.gray, marginBottom: 10 }}>
                    Accounts for {row.label} ({row.customers.length})
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: BRAND.white, borderRadius: 6, overflow: 'hidden', border: `1px solid ${BRAND.grayBorder}` }}>
                    <thead>
                      <tr style={{ background: BRAND.grayLight }}>
                        <th style={nestedThStyle}>Account</th>
                        <th style={nestedThStyle}>Service start</th>
                        <th style={{ ...nestedThStyle, textAlign: 'right' }}>Monthly spend</th>
                        <th style={{ ...nestedThStyle, textAlign: 'right' }}>Contracts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {row.customers.map((customer) => (
                        <tr key={customer.id} style={{ borderTop: `1px solid ${BRAND.grayBorder}` }}>
                          <td style={{ padding: '10px 12px' }}>
                            <button
                              type="button"
                              onClick={() => onOpenCustomer(customer.id)}
                              style={{ background: 'none', border: 'none', color: BRAND.red, fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left' }}
                            >
                              {customer.company}
                            </button>
                          </td>
                          <td style={{ padding: '10px 12px', color: BRAND.gray }}>
                            {serviceStartForCustomer(customer, contractsByCustomer[customer.id] ?? []).display}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                            {customer.spend > 0 ? `$${customer.spend.toLocaleString()}/mo` : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                            {customer.contracts ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </td>
            </tr>
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

const thStyle: React.CSSProperties = {
  padding: '11px 16px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: BRAND.gray,
};

const nestedThStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: BRAND.gray,
};
