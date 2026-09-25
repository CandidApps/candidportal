'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import type { Customer } from '@/components/CustomersView';
import { filterCustomersForAccountsList, type AccountListTab } from '@/components/customers/accounts-list-utils';
import type { CandidContractRecord, CustomerDocument, DealStatus } from '@/lib/customer-records';
import { DEAL_STATUS_OPTIONS, documentDisplayName } from '@/lib/customer-records';
import { contractServiceTitle } from '@/lib/customer-contracts-from-deals';
import { contractServiceTypeLabel } from '@/lib/crm/contract-service-pricing';
import { findDocumentsForContract } from '@/lib/contract-document-link';
import { BRAND } from '@/lib/ui/brand-tokens';

export type ContractListRow = {
  key: string;
  customerId: string;
  company: string;
  contract: CandidContractRecord;
  serviceType: string;
  serviceLabel: string;
  product: string;
  provider: string;
  commission: number | null;
  status: DealStatus | string;
  attachedLabel: string;
  hasAttachment: boolean;
};

function commissionAmount(ct: CandidContractRecord): number | null {
  if (ct.agentCommissionRate != null && ct.monthly != null && Number.isFinite(ct.monthly)) {
    return Math.round(((ct.monthly * ct.agentCommissionRate) / 100) * 100) / 100;
  }
  if (ct.monthly != null && Number.isFinite(ct.monthly)) return ct.monthly;
  if (ct.mrc != null && Number.isFinite(ct.mrc)) return ct.mrc;
  return null;
}

export function buildContractListRows(
  customers: Customer[],
  accountTab: AccountListTab,
  contractsByCustomer: Record<string, CandidContractRecord[]>,
  documentsByCustomer: Record<string, CustomerDocument[]>,
  baseServiceFilters: ReadonlySet<string>,
  search: string,
): ContractListRow[] {
  const filtered = filterCustomersForAccountsList(
    customers,
    accountTab,
    contractsByCustomer,
    baseServiceFilters,
  );
  const q = search.trim().toLowerCase();
  const rows: ContractListRow[] = [];
  for (const customer of filtered) {
    const contracts = contractsByCustomer[customer.id] ?? [];
    const documents = documentsByCustomer[customer.id] ?? [];
    for (const contract of contracts) {
      const linked = findDocumentsForContract(contract, documents);
      const withBytes = linked.filter((d) => d.storagePath);
      const hasAttachment = withBytes.length > 0 || linked.length > 0;
      const attachedLabel = withBytes.length
        ? withBytes.length === 1
          ? documentDisplayName(withBytes[0]!)
          : `${withBytes.length} files`
        : linked.length
          ? 'Linked (file missing)'
          : 'None';
      const serviceType = contract.serviceTypeId
        ? contractServiceTypeLabel(contract.serviceTypeId)
        : contract.baseService || contract.service || '—';
      const serviceLabel = contract.serviceDetail || contract.service || contractServiceTitle(contract);
      const product = contract.product || '—';
      const provider = contract.solution || contract.vendor || '—';
      const status = contract.dealStatus || 'active';
      if (q) {
        const hay = [
          customer.company,
          serviceType,
          serviceLabel,
          product,
          provider,
          status,
          contract.paySource,
          attachedLabel,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) continue;
      }
      rows.push({
        key: `${customer.id}::${contract.id}`,
        customerId: customer.id,
        company: customer.company,
        contract,
        serviceType,
        serviceLabel,
        product,
        provider,
        commission: commissionAmount(contract),
        status,
        attachedLabel,
        hasAttachment,
      });
    }
  }
  rows.sort((a, b) => a.company.localeCompare(b.company) || a.provider.localeCompare(b.provider));
  return rows;
}

type Props = {
  customers: Customer[];
  accountTab: AccountListTab;
  contractsByCustomer: Record<string, CandidContractRecord[]>;
  documentsByCustomer?: Record<string, CustomerDocument[]>;
  search: string;
  baseServiceFilters?: ReadonlySet<string>;
  onOpenCustomer: (customerId: string) => void;
  /** Open edit-contract modal for this deal from the overview. */
  onOpenContract?: (customerId: string, contract: CandidContractRecord) => void;
  listMode?: 'table' | 'grid';
};

export function AccountsContractView({
  customers,
  accountTab,
  contractsByCustomer,
  documentsByCustomer = {},
  search,
  baseServiceFilters = new Set(),
  onOpenCustomer,
  onOpenContract,
  listMode = 'table',
}: Props) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>('all');

  const allRows = useMemo(
    () =>
      buildContractListRows(
        customers,
        accountTab,
        contractsByCustomer,
        documentsByCustomer,
        baseServiceFilters,
        search,
      ),
    [customers, accountTab, contractsByCustomer, documentsByCustomer, baseServiceFilters, search],
  );

  const serviceTypeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) {
      if (r.serviceType && r.serviceType !== '—') set.add(r.serviceType);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allRows]);

  const rows = useMemo(() => {
    return allRows.filter((r) => {
      if (statusFilter !== 'all' && String(r.status).toLowerCase() !== statusFilter) return false;
      if (serviceTypeFilter !== 'all' && r.serviceType !== serviceTypeFilter) return false;
      return true;
    });
  }, [allRows, statusFilter, serviceTypeFilter]);

  const openContract = (row: ContractListRow) => {
    if (onOpenContract) onOpenContract(row.customerId, row.contract);
    else onOpenCustomer(row.customerId);
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          padding: '10px 16px',
          borderBottom: `1px solid ${BRAND.grayBorder}`,
          background: BRAND.grayLight,
          flexWrap: 'wrap',
        }}
      >
        <label style={{ fontSize: 12, color: BRAND.gray, fontWeight: 600 }}>Service type</label>
        <select
          value={serviceTypeFilter}
          onChange={(e) => setServiceTypeFilter(e.target.value)}
          aria-label="Filter contracts by service type"
          style={{
            fontSize: 13,
            padding: '6px 10px',
            borderRadius: 6,
            border: `1px solid ${BRAND.grayBorder}`,
            background: BRAND.white,
            maxWidth: 220,
          }}
        >
          <option value="all">All service types</option>
          {serviceTypeOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label style={{ fontSize: 12, color: BRAND.gray, fontWeight: 600 }}>Status</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter contracts by status"
          style={{
            fontSize: 13,
            padding: '6px 10px',
            borderRadius: 6,
            border: `1px solid ${BRAND.grayBorder}`,
            background: BRAND.white,
          }}
        >
          <option value="all">All statuses</option>
          {DEAL_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: BRAND.gray }}>
          {rows.length} contract{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      {rows.length === 0 ? (
        <p style={{ padding: 24, fontSize: 13, color: BRAND.gray }}>No contracts match.</p>
      ) : listMode === 'grid' ? (
        <div className="accounts-contract-grid">
          {rows.map((row) => (
            <button
              key={row.key}
              type="button"
              className="accounts-contract-card"
              onClick={() => openContract(row)}
            >
              <div className="accounts-contract-card-title">{row.company}</div>
              <div className="accounts-contract-card-meta">{row.provider}</div>
              <div className="accounts-contract-card-line">{row.serviceType}</div>
              <div className="accounts-contract-card-line">{row.serviceLabel}</div>
              <div className="accounts-contract-card-line">Product: {row.product}</div>
              <div className="accounts-contract-card-line">
                Contract: {row.hasAttachment ? row.attachedLabel : 'None attached'}
              </div>
              <div className="accounts-contract-card-footer">
                <span>{row.status}</span>
                <span>
                  {row.commission != null
                    ? `$${row.commission.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                    : '—'}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <table className="accounts-list-table">
          <thead>
            <tr style={{ background: BRAND.grayLight }}>
              <th style={thStyle}>Account</th>
              <th style={thStyle}>Service type</th>
              <th style={thStyle}>Service label</th>
              <th style={thStyle}>Product (Provider Rates)</th>
              <th style={thStyle}>Provider</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Commission</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Contract attached</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} style={{ borderBottom: `1px solid ${BRAND.grayBorder}` }}>
                <td style={{ padding: '12px 16px' }}>
                  <button
                    type="button"
                    onClick={() => onOpenCustomer(row.customerId)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: BRAND.red,
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                      textAlign: 'left',
                    }}
                  >
                    {row.company}
                  </button>
                </td>
                <td style={tdStyle}>{row.serviceType}</td>
                <td style={tdStyle}>{row.serviceLabel}</td>
                <td style={tdStyle}>{row.product}</td>
                <td style={tdStyle}>{row.provider}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  {row.commission != null
                    ? `$${row.commission.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                    : '—'}
                </td>
                <td style={tdStyle}>{row.status}</td>
                <td style={tdStyle}>
                  <button
                    type="button"
                    onClick={() => openContract(row)}
                    title="Open contract"
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      color: row.hasAttachment ? BRAND.red : BRAND.gray,
                      fontWeight: row.hasAttachment ? 600 : 500,
                      textDecoration: 'underline',
                      textUnderlineOffset: 2,
                      textAlign: 'left',
                      maxWidth: 220,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.attachedLabel}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const thStyle: CSSProperties = {
  padding: '11px 16px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: BRAND.gray,
};

const tdStyle: CSSProperties = {
  padding: '12px 16px',
  fontSize: 13,
  color: BRAND.grayDark,
};
