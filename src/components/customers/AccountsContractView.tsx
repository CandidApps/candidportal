'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { AccountServiceFilter } from '@/components/customers/AccountServiceFilter';
import {
  CommissionRangeFilter,
  EMPTY_COMMISSION_RANGE,
  commissionInRange,
  isCommissionRangeActive,
  type CommissionRange,
} from '@/components/customers/CommissionRangeFilter';
import { MergeContractsModal } from '@/components/customers/MergeContractsModal';
import { findLikelyDuplicatePairs, type DuplicatePair } from '@/lib/crm/contract-duplicates';
import type { Customer } from '@/components/CustomersView';
import { filterCustomersForAccountsList, type AccountListTab } from '@/components/customers/accounts-list-utils';
import type { CandidContractRecord, CustomerDocument, DealStatus } from '@/lib/customer-records';
import { DEAL_STATUS_OPTIONS, documentDisplayName } from '@/lib/customer-records';
import { contractServiceTitle } from '@/lib/customer-contracts-from-deals';
import { contractServiceTypeLabel } from '@/lib/crm/contract-service-pricing';
import { findDocumentsForContract } from '@/lib/contract-document-link';
import { commissionForContract } from '@/lib/commissions/account-cycle-commissions';
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
  /** All documents on the account (not only this contract). */
  accountDocumentCount: number;
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
  /** Cycle commission per deal key; when set, replaces the monthly-cost estimate. */
  commissionByDeal?: ReadonlyMap<string, number>,
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
        commission: commissionByDeal ? commissionForContract(commissionByDeal, contract) : commissionAmount(contract),
        status,
        attachedLabel,
        hasAttachment,
        accountDocumentCount: documents.length,
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
  /** Supplier commission per deal key for `commissionPeriodLabel` (same source as the Customer tab). */
  commissionByDeal?: ReadonlyMap<string, number>;
  commissionPeriodLabel?: string;
  /** Persist a merge of two deals on the same account (same flow as in-account merge). */
  onMergeContracts?: (
    customerId: string,
    merged: CandidContractRecord,
    remove: CandidContractRecord,
  ) => Promise<void>;
  listMode?: 'table' | 'grid';
};

type MultiFilterKey = 'account' | 'serviceType' | 'serviceLabel' | 'product' | 'provider' | 'status' | 'attached';

const MULTI_FILTERS: { key: MultiFilterKey; emptyLabel: string; search: string; aria: string; none: string }[] = [
  { key: 'account', emptyLabel: 'All accounts', search: 'Search accounts…', aria: 'Filter contracts by account', none: 'No matching accounts' },
  { key: 'serviceType', emptyLabel: 'All service types', search: 'Search service types…', aria: 'Filter contracts by service type', none: 'No matching service types' },
  { key: 'serviceLabel', emptyLabel: 'All service labels', search: 'Search service labels…', aria: 'Filter contracts by service label', none: 'No matching service labels' },
  { key: 'product', emptyLabel: 'All products', search: 'Search products…', aria: 'Filter contracts by product', none: 'No matching products' },
  { key: 'provider', emptyLabel: 'All providers', search: 'Search providers…', aria: 'Filter contracts by provider', none: 'No matching providers' },
  { key: 'status', emptyLabel: 'All statuses', search: 'Search statuses…', aria: 'Filter contracts by status', none: 'No matching statuses' },
  { key: 'attached', emptyLabel: 'Any contract attached', search: 'Search…', aria: 'Filter contracts by attached contract', none: 'No matches' },
];

const EMPTY_MULTI: Record<MultiFilterKey, ReadonlySet<string>> = {
  account: new Set(),
  serviceType: new Set(),
  serviceLabel: new Set(),
  product: new Set(),
  provider: new Set(),
  status: new Set(),
  attached: new Set(),
};

function statusLabel(status: string): string {
  const v = String(status || '').toLowerCase();
  return DEAL_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? (status || '—');
}

function attachedCategory(row: ContractListRow): string {
  if (row.attachedLabel === 'None') return 'None attached';
  if (row.attachedLabel === 'Linked (file missing)') return 'Linked (file missing)';
  return 'File attached';
}

function multiValue(row: ContractListRow, key: MultiFilterKey): string {
  switch (key) {
    case 'account':
      return row.company;
    case 'serviceType':
      return row.serviceType;
    case 'serviceLabel':
      return row.serviceLabel || '—';
    case 'product':
      return row.product;
    case 'provider':
      return row.provider;
    case 'status':
      return statusLabel(String(row.status));
    case 'attached':
      return attachedCategory(row);
  }
}

type SortKey = MultiFilterKey | 'commission' | 'documents';
type SortDir = 'asc' | 'desc';

function isBlankSortValue(v: string | number | null): boolean {
  return v == null || v === '' || v === '—';
}

function sortValue(row: ContractListRow, key: SortKey): string | number | null {
  if (key === 'commission') return row.commission;
  if (key === 'documents') return row.accountDocumentCount || null;
  if (key === 'attached') return row.attachedLabel === 'None' ? null : row.attachedLabel;
  return multiValue(row, key);
}

function compareRows(a: ContractListRow, b: ContractListRow, key: SortKey, dir: SortDir): number {
  const va = sortValue(a, key);
  const vb = sortValue(b, key);
  const blankA = isBlankSortValue(va);
  const blankB = isBlankSortValue(vb);
  let cmp = 0;
  if (blankA || blankB) {
    cmp = blankA === blankB ? 0 : blankA ? 1 : -1;
  } else {
    const raw =
      typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), undefined, { sensitivity: 'base', numeric: true });
    cmp = dir === 'asc' ? raw : -raw;
  }
  return cmp || a.company.localeCompare(b.company) || a.provider.localeCompare(b.provider);
}

function formatMoney(n: number | null): string {
  return n != null ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—';
}

export function AccountsContractView({
  customers,
  accountTab,
  contractsByCustomer,
  documentsByCustomer = {},
  search,
  baseServiceFilters = new Set(),
  onOpenCustomer,
  onOpenContract,
  onMergeContracts,
  commissionByDeal,
  commissionPeriodLabel,
  listMode = 'table',
}: Props) {
  const [multi, setMulti] = useState<Record<MultiFilterKey, ReadonlySet<string>>>(EMPTY_MULTI);
  const [commissionRange, setCommissionRange] = useState<CommissionRange>(EMPTY_COMMISSION_RANGE);
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('account');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set());
  const [merging, setMerging] = useState<{ customerId: string; a: CandidContractRecord; b: CandidContractRecord } | null>(
    null,
  );

  const allRows = useMemo(
    () =>
      buildContractListRows(
        customers,
        accountTab,
        contractsByCustomer,
        documentsByCustomer,
        baseServiceFilters,
        search,
        commissionByDeal,
      ),
    [customers, accountTab, contractsByCustomer, documentsByCustomer, baseServiceFilters, search, commissionByDeal],
  );

  const optionsByKey = useMemo(() => {
    const out = {} as Record<MultiFilterKey, string[]>;
    for (const f of MULTI_FILTERS) {
      const set = new Set<string>();
      for (const r of allRows) set.add(multiValue(r, f.key));
      out[f.key] = [...set].sort((a, b) => a.localeCompare(b));
    }
    return out;
  }, [allRows]);

  const commissionBounds = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const r of allRows) {
      if (r.commission == null) continue;
      min = Math.min(min, r.commission);
      max = Math.max(max, r.commission);
    }
    return Number.isFinite(min) ? { min: Math.min(0, min), max } : { min: 0, max: 0 };
  }, [allRows]);

  /** Strongest same-account High/Medium duplicate pair per row key. */
  const duplicateByKey = useMemo(() => {
    const pairs = findLikelyDuplicatePairs(
      allRows.map((r) => ({
        id: r.key,
        customerId: r.customerId,
        company: r.company,
        provider: r.provider === '—' ? '' : r.provider,
        product: r.contract.product,
        paySource: r.contract.paySource,
        monthly: r.contract.monthly ?? r.contract.mrc ?? null,
        dealUid: r.contract.dealId,
        status: String(r.status),
        service: r.contract.service,
        locationId: r.contract.physicalLocationId || r.contract.locationId,
      })),
      { crossAccount: false, minScore: 55 },
    );
    const map = new Map<string, DuplicatePair & { partnerKey: string }>();
    for (const pair of pairs) {
      for (const [self, other] of [
        [pair.a.id, pair.b.id],
        [pair.b.id, pair.a.id],
      ] as const) {
        const existing = map.get(self);
        if (!existing || existing.score < pair.score) map.set(self, { ...pair, partnerKey: other });
      }
    }
    return map;
  }, [allRows]);

  const rows = useMemo(() => {
    const selectedLower = {} as Record<MultiFilterKey, Set<string> | null>;
    for (const f of MULTI_FILTERS) {
      const sel = multi[f.key];
      selectedLower[f.key] = sel.size ? new Set([...sel].map((v) => v.toLowerCase())) : null;
    }
    const filtered = allRows.filter((r) => {
      for (const f of MULTI_FILTERS) {
        const sel = selectedLower[f.key];
        if (sel && !sel.has(multiValue(r, f.key).toLowerCase())) return false;
      }
      if (!commissionInRange(r.commission, commissionRange)) return false;
      if (duplicatesOnly && !duplicateByKey.has(r.key)) return false;
      return true;
    });
    return filtered.sort((a, b) => compareRows(a, b, sortKey, sortDir));
  }, [allRows, multi, commissionRange, duplicatesOnly, duplicateByKey, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'commission' || key === 'documents' ? 'desc' : 'asc');
    }
  };

  const sortTh = (label: string, key: SortKey, right?: boolean) => {
    const active = sortKey === key;
    return (
      <th
        style={{
          ...thStyle,
          textAlign: right ? 'right' : 'left',
          color: active ? BRAND.red : BRAND.gray,
          cursor: 'pointer',
          userSelect: 'none',
        }}
        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        onClick={() => handleSort(key)}
      >
        {label}
        {active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
      </th>
    );
  };

  const filtersActive =
    MULTI_FILTERS.some((f) => multi[f.key].size > 0) || isCommissionRangeActive(commissionRange) || duplicatesOnly;

  const selectedRows = useMemo(() => allRows.filter((r) => selectedKeys.has(r.key)), [allRows, selectedKeys]);
  const mergeBlockReason =
    selectedRows.length !== 2
      ? 'Select exactly 2 contracts on the same account to merge.'
      : selectedRows[0]!.customerId !== selectedRows[1]!.customerId
        ? 'Both contracts must be on the same account to merge.'
        : null;

  const toggleSelected = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectDuplicatePair = (row: ContractListRow) => {
    const dup = duplicateByKey.get(row.key);
    if (!dup) return;
    setSelectedKeys(new Set([row.key, dup.partnerKey]));
  };

  const openMerge = () => {
    if (mergeBlockReason || !onMergeContracts) return;
    const [a, b] = selectedRows as [ContractListRow, ContractListRow];
    setMerging({ customerId: a.customerId, a: a.contract, b: b.contract });
  };

  const openContract = (row: ContractListRow) => {
    if (onOpenContract) onOpenContract(row.customerId, row.contract);
    else onOpenCustomer(row.customerId);
  };

  const duplicateBadge = (row: ContractListRow) => {
    const dup = duplicateByKey.get(row.key);
    if (!dup) return null;
    const title = `Likely duplicate (${dup.confidence}, score ${dup.score}): ${dup.reasons.join('; ')}`;
    if (listMode === 'grid' || !onMergeContracts) {
      return (
        <span className={`contract-dup-badge contract-dup-badge--${dup.confidence.toLowerCase()}`} title={title}>
          Likely duplicate
        </span>
      );
    }
    return (
      <button
        type="button"
        className={`contract-dup-badge contract-dup-badge--${dup.confidence.toLowerCase()}`}
        title={`${title}. Click to select both for merge.`}
        onClick={() => selectDuplicatePair(row)}
      >
        Likely duplicate
      </button>
    );
  };

  const mergingLocations = merging ? (customers.find((c) => c.id === merging.customerId)?.locations ?? []) : [];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          padding: '10px 16px',
          borderBottom: `1px solid ${BRAND.grayBorder}`,
          background: BRAND.grayLight,
          flexWrap: 'wrap',
        }}
      >
        {MULTI_FILTERS.map((f) => (
          <AccountServiceFilter
            key={f.key}
            options={optionsByKey[f.key]}
            selected={multi[f.key]}
            onChange={(next) => setMulti((prev) => ({ ...prev, [f.key]: next }))}
            emptyLabel={f.emptyLabel}
            searchPlaceholder={f.search}
            ariaLabel={f.aria}
            noMatchesLabel={f.none}
          />
        ))}
        <CommissionRangeFilter value={commissionRange} onChange={setCommissionRange} bounds={commissionBounds} />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: BRAND.grayDark }}>
          <input type="checkbox" checked={duplicatesOnly} onChange={(e) => setDuplicatesOnly(e.target.checked)} />
          Likely duplicates only ({duplicateByKey.size})
        </label>
        {filtersActive ? (
          <button
            type="button"
            className="ac-kind-multi-clear"
            style={{ width: 'auto', margin: 0, border: 'none', padding: '6px 8px', color: BRAND.red, fontWeight: 600 }}
            onClick={() => {
              setMulti(EMPTY_MULTI);
              setCommissionRange(EMPTY_COMMISSION_RANGE);
              setDuplicatesOnly(false);
            }}
          >
            Clear filters
          </button>
        ) : null}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: BRAND.gray }}>
          {rows.length} contract{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      {onMergeContracts && listMode === 'table' && selectedKeys.size > 0 ? (
        <div className="contract-merge-bar">
          <span>
            {selectedKeys.size} selected
            {selectedRows.length === 2 && !mergeBlockReason ? ` · ${selectedRows[0]!.company}` : ''}
          </span>
          <button
            type="button"
            className="contract-merge-bar-btn contract-merge-bar-btn--primary"
            disabled={Boolean(mergeBlockReason)}
            title={mergeBlockReason ?? 'Merge the two selected contracts'}
            onClick={openMerge}
          >
            Merge selected
          </button>
          {mergeBlockReason ? <span className="contract-merge-bar-hint">{mergeBlockReason}</span> : null}
          <button type="button" className="contract-merge-bar-btn" onClick={() => setSelectedKeys(new Set())}>
            Clear selection
          </button>
        </div>
      ) : null}

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
              <div className="accounts-contract-card-meta">
                {row.provider} {duplicateBadge(row)}
              </div>
              <div className="accounts-contract-card-line">{row.serviceType}</div>
              <div className="accounts-contract-card-line">{row.serviceLabel}</div>
              <div className="accounts-contract-card-line">Product: {row.product}</div>
              <div className="accounts-contract-card-line">
                Documents on account: {row.accountDocumentCount}
              </div>
              <div className="accounts-contract-card-line">
                Contract: {row.hasAttachment ? row.attachedLabel : 'None attached'}
              </div>
              <div className="accounts-contract-card-footer">
                <span>{row.status}</span>
                <span>{formatMoney(row.commission)}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <table className="accounts-list-table">
          <thead>
            <tr style={{ background: BRAND.grayLight }}>
              {onMergeContracts ? <th style={{ ...thStyle, width: 36, paddingRight: 0 }} aria-label="Select" /> : null}
              {sortTh('Account', 'account')}
              {sortTh('Service type', 'serviceType')}
              {sortTh('Service label', 'serviceLabel')}
              {sortTh('Product (Provider Rates)', 'product')}
              {sortTh('Provider', 'provider')}
              {sortTh(commissionPeriodLabel ? `Commission (${commissionPeriodLabel})` : 'Commission', 'commission', true)}
              {sortTh('Status', 'status')}
              {sortTh('Documents attached', 'documents', true)}
              {sortTh('Contract attached', 'attached')}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                style={{
                  borderBottom: `1px solid ${BRAND.grayBorder}`,
                  background: selectedKeys.has(row.key) ? 'var(--surface-muted)' : undefined,
                }}
              >
                {onMergeContracts ? (
                  <td style={{ padding: '12px 0 12px 16px' }}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.company} ${row.provider}`}
                      checked={selectedKeys.has(row.key)}
                      onChange={() => toggleSelected(row.key)}
                    />
                  </td>
                ) : null}
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
                <td style={tdStyle}>
                  {row.provider}
                  {duplicateBadge(row)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  {formatMoney(row.commission)}
                </td>
                <td style={tdStyle}>{row.status}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  {row.accountDocumentCount}
                </td>
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

      {merging && onMergeContracts ? (
        <MergeContractsModal
          contractA={merging.a}
          contractB={merging.b}
          locations={mergingLocations}
          onClose={() => setMerging(null)}
          onMerge={async (merged, remove) => {
            await onMergeContracts(merging.customerId, merged, remove);
            setSelectedKeys(new Set());
            setMerging(null);
          }}
        />
      ) : null}
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
