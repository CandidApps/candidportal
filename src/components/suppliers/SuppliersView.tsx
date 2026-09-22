'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  buildCommissionPartnerRows,
  commissionSourceKey,
  dealsForPaySource,
  type CommissionPartnerRow,
} from '@/lib/commission-partners';
import { parentMerchantFor } from '@/lib/bmw/deal-master';
import {
  loadSolutionProviders,
  onSolutionProvidersUpdated,
  dealsForProvider,
  getSolutionProvider,
  preferSavedProvider,
  type SolutionProviderRecord,
} from '@/lib/solution-providers';
import { providerCategoryLabel, PROVIDER_CATEGORY_OPTIONS } from '@/lib/provider-categories';
import { fetchPartnerSuppliers, type PartnerSupplierRecord } from '@/lib/services/bank-deposits';
import { SupplierLogo } from '@/components/SupplierLogo';
import { EditCommissionPartnerModal } from '@/components/suppliers/EditCommissionPartnerModal';
import { EditSupplierModal } from '@/components/suppliers/EditSupplierModal';
import { ImportExportControls } from '@/components/suppliers/ImportExportControls';
import { SupplierDetailPage } from '@/components/suppliers/SupplierDetailPage';
import { CommissionPartnerDetailPage } from '@/components/suppliers/CommissionPartnerDetailPage';
import {
  exportCommissionPartnersCsv,
  exportCommissionPartnersXlsx,
  importCommissionPartnersFromFile,
} from '@/lib/partners-spreadsheet';
import {
  exportSolutionProvidersCsv,
  exportSolutionProvidersXlsx,
  importSolutionProvidersFromFile,
} from '@/lib/suppliers-spreadsheet';
import { RegistryDocumentsSection } from '@/components/shared/RegistryDocumentsSection';

type PartnersTab = 'commission' | 'suppliers';
type SuppliersListMode = 'table' | 'grid';
type SupplierSortKey = 'name' | 'type' | 'solutions' | 'contacts' | 'customers';

const SUPPLIERS_VIEW_PREF_KEY = 'candid-partners-suppliers-list-mode';
const SUPPLIERS_FILTER_PREF_KEY = 'candid-partners-suppliers-filters';

type TriFilter = 'any' | 'yes' | 'no';

type SupplierListFilters = {
  categories: string[];
  hasSolutions: TriFilter;
  hasActiveDeals: TriFilter;
  paySources: string[];
};

const DEFAULT_SUPPLIER_FILTERS: SupplierListFilters = {
  categories: [],
  hasSolutions: 'any',
  hasActiveDeals: 'any',
  paySources: [],
};

function readSupplierFilters(): SupplierListFilters {
  if (typeof window === 'undefined') return DEFAULT_SUPPLIER_FILTERS;
  try {
    const raw = localStorage.getItem(SUPPLIERS_FILTER_PREF_KEY);
    if (!raw) return DEFAULT_SUPPLIER_FILTERS;
    const parsed = JSON.parse(raw) as Partial<SupplierListFilters> & {
      category?: string;
      paySource?: string;
    };
    const categories = Array.isArray(parsed.categories)
      ? parsed.categories.filter((x): x is string => typeof x === 'string')
      : typeof parsed.category === 'string' && parsed.category
        ? [parsed.category]
        : [];
    const paySources = Array.isArray(parsed.paySources)
      ? parsed.paySources.filter((x): x is string => typeof x === 'string')
      : typeof parsed.paySource === 'string' && parsed.paySource
        ? [parsed.paySource]
        : [];
    return {
      categories,
      hasSolutions:
        parsed.hasSolutions === 'yes' || parsed.hasSolutions === 'no' ? parsed.hasSolutions : 'any',
      hasActiveDeals:
        parsed.hasActiveDeals === 'yes' || parsed.hasActiveDeals === 'no'
          ? parsed.hasActiveDeals
          : 'any',
      paySources,
    };
  } catch {
    return DEFAULT_SUPPLIER_FILTERS;
  }
}

/** CR-0021: active = BmwDeal.activeDeal (same flag used in commissions / CRM deal master). */
function isActiveCustomerDeal(activeDeal: boolean | undefined): boolean {
  return Boolean(activeDeal);
}

function Chevron({ open }: { open: boolean }) {
  return <span className={`comm-chevron${open ? ' open' : ''}`} aria-hidden>▶</span>;
}

function HintBubble({ text }: { text: string }) {
  return (
    <span className="partners-hint" tabIndex={0}>
      <span className="partners-hint-mark" aria-hidden>?</span>
      <span className="partners-hint-tip" role="tooltip">{text}</span>
    </span>
  );
}

function MultiSelectFilter({
  allLabel,
  options,
  selected,
  onChange,
  ariaLabel,
}: {
  allLabel: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
        : `${selected.length} selected`;

  const toggle = (value: string) => {
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value));
    else onChange([...selected, value]);
  };

  return (
    <div className="partners-multi-filter" ref={rootRef}>
      <button
        type="button"
        className={`partners-filter-select partners-multi-filter-trigger${selected.length ? ' has-value' : ''}`}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="partners-multi-filter-summary">{summary}</span>
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="partners-multi-filter-menu" role="listbox" aria-multiselectable>
          <button
            type="button"
            className="partners-multi-filter-item"
            onClick={() => {
              onChange([]);
              setOpen(false);
            }}
          >
            {allLabel}
          </button>
          {options.map((o) => {
            const on = selected.includes(o.value);
            return (
              <label key={o.value} className={`partners-multi-filter-item${on ? ' is-on' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(o.value)}
                />
                <span>{o.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SortableTh({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  align = 'left',
  style,
}: {
  label: string;
  sortKey: SupplierSortKey;
  activeKey: SupplierSortKey;
  dir: 'asc' | 'desc';
  onSort: (key: SupplierSortKey) => void;
  align?: 'left' | 'right';
  style?: CSSProperties;
}) {
  const active = activeKey === sortKey;
  return (
    <th
      style={{ ...style, textAlign: align, cursor: 'pointer', userSelect: 'none' }}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      onClick={() => onSort(sortKey)}
    >
      <span className="partners-sort-th">
        {label}
        <span className={`partners-sort-ind${active ? ' is-active' : ''}`} aria-hidden>
          {active ? (dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </span>
    </th>
  );
}

function CommissionPartnerExpanded({
  row,
  customers,
  onOpenCustomer,
}: {
  row: CommissionPartnerRow;
  customers?: Array<{ id: string; company: string }>;
  onOpenCustomer?: (customerId: string) => void;
}) {
  const [panel, setPanel] = useState<'customers' | 'documents'>('customers');
  const dealRows = dealsForPaySource(row.paySource);
  const entityKey = commissionSourceKey(row.paySource);

  const openMerchant = (merchant: string) => {
    if (!onOpenCustomer || !customers?.length) return;
    const parent = parentMerchantFor(merchant.trim());
    const match = customers.find(
      (c) =>
        c.company === merchant ||
        c.company === parent ||
        parentMerchantFor(c.company) === parent,
    );
    if (match) onOpenCustomer(match.id);
  };

  return (
    <div style={{ padding: '16px 20px' }}>
      <div className="comm-tabs" style={{ marginBottom: 14 }}>
        <button
          type="button"
          className={`comm-tab${panel === 'customers' ? ' active' : ''}`}
          onClick={() => setPanel('customers')}
        >
          Customers ({dealRows.length})
        </button>
        <button
          type="button"
          className={`comm-tab${panel === 'documents' ? ' active' : ''}`}
          onClick={() => setPanel('documents')}
        >
          Documents
        </button>
      </div>

      {panel === 'customers' ? (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 10 }}>
            Customers via {row.paySource}
          </div>
          {dealRows.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--gray)' }}>No BMW deals with this pay source.</p>
          ) : (
            <table className="admin-mini-table">
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Provider</th>
                  <th>Solution</th>
                  <th>Agent</th>
                  <th>Deal UID</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dealRows.map((deal) => (
                  <tr
                    key={deal.rowNum}
                    className={onOpenCustomer ? 'comm-row-clickable' : undefined}
                    onClick={() => openMerchant(deal.merchant)}
                  >
                    <td style={onOpenCustomer ? { color: 'var(--red)', fontWeight: 600 } : undefined}>
                      {deal.merchant}
                    </td>
                    <td style={{ fontSize: 12 }}>{deal.provider || '—'}</td>
                    <td style={{ fontSize: 12 }}>{deal.product || deal.serviceDescription || '—'}</td>
                    <td style={{ fontSize: 12 }}>{deal.agentCommId || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{deal.dealUid}</td>
                    <td style={{ fontSize: 11, fontWeight: 600, color: isActiveCustomerDeal(deal.activeDeal) ? 'var(--green)' : 'var(--gray)' }}>
                      {isActiveCustomerDeal(deal.activeDeal) ? 'Active' : 'Inactive'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <RegistryDocumentsSection
          embedded
          entityType="commission_partner"
          entityKey={entityKey}
          entityLabel={row.paySource}
        />
      )}
    </div>
  );
}

function CommissionPartnerTable({
  rows,
  expandedPaySource,
  onToggle,
  onView,
  onEdit,
  customers,
  onOpenCustomer,
}: {
  rows: CommissionPartnerRow[];
  expandedPaySource: string | null;
  onToggle: (paySource: string | null) => void;
  onView: (row: CommissionPartnerRow) => void;
  onEdit: (row: CommissionPartnerRow) => void;
  customers?: Array<{ id: string; company: string }>;
  onOpenCustomer?: (customerId: string) => void;
}) {
  if (!rows.length) {
    return <p style={{ padding: '20px 16px', fontSize: 13, color: 'var(--gray)' }}>No commission partners found.</p>;
  }

  return (
    <table className="admin-mini-table comm-table">
      <thead>
        <tr>
          <th style={{ width: 36 }} />
          <th>Commission partner</th>
          <th>Type</th>
          <th>Residual import</th>
          <th>Bank ORIG name</th>
          <th>Bank ORIG ID</th>
          <th>Contact</th>
          <th style={{ textAlign: 'right' }}>Customers</th>
          <th style={{ width: 120 }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const dealRows = dealsForPaySource(row.paySource);
          const isOpen = expandedPaySource === row.paySource;

          return (
            <Fragment key={row.paySource}>
              <tr className="comm-row-clickable" onClick={() => onToggle(isOpen ? null : row.paySource)}>
                <td><Chevron open={isOpen} /></td>
                <td style={{ fontWeight: 600 }}>{row.paySource}</td>
                <td style={{ fontSize: 12, color: 'var(--gray)' }}>
                  {providerCategoryLabel(row.partner?.provider_category)}
                </td>
                <td style={{ fontSize: 12 }}>
                  {row.hasResidualImport ? (
                    <span style={{ color: 'var(--green)', fontWeight: 600 }}>Yes</span>
                  ) : (
                    <span style={{ color: 'var(--gray)' }}>Pay source only</span>
                  )}
                </td>
                <td style={{ fontSize: 12 }}>{row.bankOrigCoName ?? '—'}</td>
                <td style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                  {row.bankOrigIds.length ? row.bankOrigIds.join(', ') : '—'}
                </td>
                <td style={{ fontSize: 12 }}>
                  {row.contactName && <div>{row.contactName}</div>}
                  {row.contactEmail && <div style={{ color: 'var(--gray)' }}>{row.contactEmail}</div>}
                  {!row.contactName && !row.contactEmail && '—'}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{dealRows.length}</td>
                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: 11, padding: '4px 10px', flex: 'none' }}
                      onClick={() => onView(row)}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: 11, padding: '4px 10px', flex: 'none' }}
                      onClick={() => onEdit(row)}
                    >
                      Edit
                    </button>
                  </div>
                </td>
              </tr>
              {isOpen && (
                <tr>
                  <td colSpan={9} style={{ padding: 0, background: 'var(--gray-light)' }}>
                    <CommissionPartnerExpanded
                      row={row}
                      customers={customers}
                      onOpenCustomer={onOpenCustomer}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

type SuppliersViewProps = {
  selectedProviderId?: string | null;
  onSelectProvider?: (id: string | null) => void;
  selectedCommissionPartnerKey?: string | null;
  onSelectCommissionPartner?: (key: string | null) => void;
  partnersTab?: PartnersTab;
  onPartnersTabChange?: (tab: PartnersTab) => void;
  customers?: Array<{ id: string; company: string }>;
  onOpenCustomer?: (customerId: string) => void;
};

function readListModePref(): SuppliersListMode {
  if (typeof window === 'undefined') return 'table';
  try {
    const v = localStorage.getItem(SUPPLIERS_VIEW_PREF_KEY);
    return v === 'grid' ? 'grid' : 'table';
  } catch {
    return 'table';
  }
}

export function SuppliersView({
  selectedProviderId: selectedProviderIdProp,
  onSelectProvider,
  selectedCommissionPartnerKey: selectedCommissionPartnerKeyProp,
  onSelectCommissionPartner,
  partnersTab: partnersTabProp,
  onPartnersTabChange,
  customers,
  onOpenCustomer,
}: SuppliersViewProps = {}) {
  const [partners, setPartners] = useState<PartnerSupplierRecord[]>([]);
  const [providers, setProviders] = useState<SolutionProviderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabInternal, setTabInternal] = useState<PartnersTab>('suppliers');
  const tab = partnersTabProp ?? tabInternal;
  const setTab = (next: PartnersTab) => {
    if (onPartnersTabChange) onPartnersTabChange(next);
    else setTabInternal(next);
  };
  const [expandedPaySource, setExpandedPaySource] = useState<string | null>(null);
  const [selectedProviderIdInternal, setSelectedProviderIdInternal] = useState<string | null>(null);
  const selectedProviderId = selectedProviderIdProp !== undefined ? selectedProviderIdProp : selectedProviderIdInternal;
  const setSelectedProviderId = (id: string | null) => {
    if (onSelectProvider) onSelectProvider(id);
    else setSelectedProviderIdInternal(id);
  };
  const [selectedCommissionPartnerKeyInternal, setSelectedCommissionPartnerKeyInternal] = useState<string | null>(null);
  const selectedCommissionPartnerKey =
    selectedCommissionPartnerKeyProp !== undefined
      ? selectedCommissionPartnerKeyProp
      : selectedCommissionPartnerKeyInternal;
  const setSelectedCommissionPartnerKey = (key: string | null) => {
    if (onSelectCommissionPartner) onSelectCommissionPartner(key);
    else setSelectedCommissionPartnerKeyInternal(key);
  };
  const [editProviderRecord, setEditProviderRecord] = useState<SolutionProviderRecord | null>(null);
  const [providerSearch, setProviderSearch] = useState('');
  const [editPartner, setEditPartner] = useState<CommissionPartnerRow | null>(null);
  const [addProvider, setAddProvider] = useState(false);
  const [listMode, setListMode] = useState<SuppliersListMode>('table');
  const [sortKey, setSortKey] = useState<SupplierSortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState<SupplierListFilters>(DEFAULT_SUPPLIER_FILTERS);

  useEffect(() => {
    setListMode(readListModePref());
    setFilters(readSupplierFilters());
  }, []);

  const setListModePersist = (mode: SuppliersListMode) => {
    setListMode(mode);
    try {
      localStorage.setItem(SUPPLIERS_VIEW_PREF_KEY, mode);
    } catch {
      // ignore
    }
  };

  const setFiltersPersist = (next: SupplierListFilters) => {
    setFilters(next);
    try {
      localStorage.setItem(SUPPLIERS_FILTER_PREF_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const patchFilter = <K extends keyof SupplierListFilters>(key: K, value: SupplierListFilters[K]) => {
    setFiltersPersist({ ...filters, [key]: value });
  };

  const filtersActive =
    filters.categories.length > 0 ||
    filters.hasSolutions !== 'any' ||
    filters.hasActiveDeals !== 'any' ||
    filters.paySources.length > 0;

  const clearFilters = () => setFiltersPersist(DEFAULT_SUPPLIER_FILTERS);

  const refreshPartners = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPartners(await fetchPartnerSuppliers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load partners');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshProviders = useCallback(async () => {
    setProviders(await loadSolutionProviders());
  }, []);

  useEffect(() => {
    void refreshPartners();
    void refreshProviders();
  }, [refreshPartners, refreshProviders]);

  useEffect(() => onSolutionProvidersUpdated(refreshProviders), [refreshProviders]);

  // Open the matching tab when selection is driven from global search / parent.
  useEffect(() => {
    if (selectedProviderIdProp) setTab('suppliers');
  }, [selectedProviderIdProp]);

  useEffect(() => {
    if (selectedCommissionPartnerKeyProp) setTab('commission');
  }, [selectedCommissionPartnerKeyProp]);

  useEffect(() => {
    if (tab !== 'suppliers') {
      if (selectedProviderIdProp) return;
      setSelectedProviderId(null);
      setEditProviderRecord(null);
    }
  }, [tab, selectedProviderIdProp]);

  useEffect(() => {
    if (tab !== 'commission') {
      if (selectedCommissionPartnerKeyProp) return;
      setSelectedCommissionPartnerKey(null);
      setExpandedPaySource(null);
    }
  }, [tab, selectedCommissionPartnerKeyProp]);

  const commissionRows = useMemo(() => buildCommissionPartnerRows(partners), [partners]);

  const paySourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of providers) {
      for (const d of dealsForProvider(p.name)) {
        if (d.paySource?.trim()) set.add(d.paySource.trim());
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [providers]);

  const filteredProviders = useMemo(() => {
    const q = providerSearch.trim().toLowerCase();
    return providers.filter((p) => {
      if (q) {
        const name = (p.displayName ?? p.name).toLowerCase();
        if (!name.includes(q) && !p.name.toLowerCase().includes(q)) return false;
      }
      if (filters.categories.length > 0) {
        if (!filters.categories.includes(p.providerCategory || '')) return false;
      }
      if (filters.hasSolutions === 'yes' && p.solutions.length === 0) return false;
      if (filters.hasSolutions === 'no' && p.solutions.length > 0) return false;
      const deals = dealsForProvider(p.name);
      const activeCount = deals.filter((d) => isActiveCustomerDeal(d.activeDeal)).length;
      if (filters.hasActiveDeals === 'yes' && activeCount === 0) return false;
      if (filters.hasActiveDeals === 'no' && activeCount > 0) return false;
      if (filters.paySources.length > 0) {
        const keys = new Set(filters.paySources.map((s) => s.toLowerCase()));
        if (!deals.some((d) => keys.has((d.paySource || '').toLowerCase()))) return false;
      }
      return true;
    });
  }, [providers, providerSearch, filters]);

  const toggleSort = (key: SupplierSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedProviders = useMemo(() => {
    const list = [...filteredProviders];
    const mul = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const nameA = a.displayName ?? a.name;
      const nameB = b.displayName ?? b.name;
      switch (sortKey) {
        case 'type': {
          const ta = providerCategoryLabel(a.providerCategory);
          const tb = providerCategoryLabel(b.providerCategory);
          return mul * ta.localeCompare(tb) || nameA.localeCompare(nameB);
        }
        case 'solutions':
          return mul * (a.solutions.length - b.solutions.length) || nameA.localeCompare(nameB);
        case 'contacts':
          return mul * (a.contacts.length - b.contacts.length) || nameA.localeCompare(nameB);
        case 'customers': {
          // Count active deals for sort to match the Active customer deals metric.
          const ca = dealsForProvider(a.name).filter((d) => isActiveCustomerDeal(d.activeDeal)).length;
          const cb = dealsForProvider(b.name).filter((d) => isActiveCustomerDeal(d.activeDeal)).length;
          return mul * (ca - cb) || nameA.localeCompare(nameB);
        }
        case 'name':
        default:
          return mul * nameA.localeCompare(nameB);
      }
    });
    return list;
  }, [filteredProviders, sortKey, sortDir]);

  const selectedProvider = useMemo(() => {
    if (!selectedProviderId) return null;
    const found =
      providers.find((p) => p.id === selectedProviderId) ??
      getSolutionProvider(selectedProviderId);
    return found ? preferSavedProvider(found, providers) : null;
  }, [providers, selectedProviderId]);

  const selectedCommissionPartner = useMemo(() => {
    if (!selectedCommissionPartnerKey) return null;
    return (
      commissionRows.find((row) => commissionSourceKey(row.paySource) === selectedCommissionPartnerKey) ??
      null
    );
  }, [commissionRows, selectedCommissionPartnerKey]);

  const openCommissionPartnerDetail = useCallback((row: CommissionPartnerRow) => {
    setSelectedCommissionPartnerKey(commissionSourceKey(row.paySource));
  }, []);

  const openProviderDetail = useCallback((provider: SolutionProviderRecord) => {
    const resolved = preferSavedProvider(provider, providers);
    setSelectedProviderId(resolved.id);
  }, [providers]);

  // Active = BmwDeal.activeDeal (deal master). Inactive/canceled deals excluded from this stat.
  const commissionCustomerCount = useMemo(
    () =>
      commissionRows.reduce(
        (sum, row) =>
          sum + dealsForPaySource(row.paySource).filter((d) => isActiveCustomerDeal(d.activeDeal)).length,
        0,
      ),
    [commissionRows],
  );

  const supplierCustomerCount = useMemo(() => {
    const seen = new Set<string>();
    for (const p of providers) {
      for (const row of dealsForProvider(p.name)) {
        if (!isActiveCustomerDeal(row.activeDeal)) continue;
        seen.add(`${row.merchant}-${row.dealUid}`);
      }
    }
    return seen.size;
  }, [providers]);

  const savedProviderCount = useMemo(
    () => providers.filter((p) => p.dbId && !p.fromBmwOnly).length,
    [providers],
  );

  if (loading) {
    return <p style={{ fontSize: 13, color: 'var(--gray)' }}>Loading partners…</p>;
  }

  if (selectedCommissionPartner && tab === 'commission') {
    return (
      <CommissionPartnerDetailPage
        row={selectedCommissionPartner}
        partners={partners}
        onBack={() => setSelectedCommissionPartnerKey(null)}
        onUpdated={() => void refreshPartners()}
      />
    );
  }

  if (selectedProvider && tab === 'suppliers') {
    return (
      <SupplierDetailPage
        provider={selectedProvider}
        partners={partners}
        customers={customers}
        onOpenCustomer={onOpenCustomer}
        onBack={() => setSelectedProviderId(null)}
        onUpdated={(next) => {
          void refreshProviders().then(() => setSelectedProviderId(next.id));
        }}
      />
    );
  }

  return (
    <div>
      {error && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--amber-light)', color: 'var(--amber)', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div className="comm-tabs">
        <button
          type="button"
          className={`comm-tab${tab === 'suppliers' ? ' active' : ''}`}
          onClick={() => { setTab('suppliers'); setExpandedPaySource(null); setSelectedCommissionPartnerKey(null); }}
        >
          Suppliers & Vendors
        </button>
        <button
          type="button"
          className={`comm-tab${tab === 'commission' ? ' active' : ''}`}
          onClick={() => { setTab('commission'); setSelectedProviderId(null); setSelectedCommissionPartnerKey(null); }}
        >
          Commission Partners
        </button>
      </div>

      {tab === 'commission' ? (
        <>
          <div className="comm-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <div className="comm-stat-card partners-stat-card">
              <div className="partners-stat-top">
                <div className="comm-stat-label">Commission partners</div>
                <HintBubble text="Pay sources & bank deposit sources" />
              </div>
              <div className="comm-stat-value">{commissionRows.length}</div>
            </div>
            <div className="comm-stat-card partners-stat-card">
              <div className="partners-stat-top">
                <div className="comm-stat-label">Bank profiles</div>
                <HintBubble text="Deposit match configured" />
              </div>
              <div className="comm-stat-value">{commissionRows.filter((r) => r.partner).length}</div>
            </div>
            <div className="comm-stat-card partners-stat-card">
              <div className="partners-stat-top">
                <div className="comm-stat-label">Active customer deals</div>
                <HintBubble text="BMW deals with activeDeal=true for these pay sources" />
              </div>
              <div className="comm-stat-value">{commissionCustomerCount}</div>
            </div>
          </div>

          <div className="card">
            <div className="card-header" style={{ gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  Commission partners
                  <HintBubble text="Partners who pay Candid — pay sources from BMW deals, bank reports, and deposit matching (includes Candid)" />
                </div>
              </div>
              <ImportExportControls
                hideCsv
                label="Import CSV/Excel to update bank match & contacts. Export includes all pay sources."
                onExportCsv={() => exportCommissionPartnersCsv(partners)}
                onExportXlsx={() => exportCommissionPartnersXlsx(partners)}
                onImport={async (file) => {
                  const result = await importCommissionPartnersFromFile(file, [...partners]);
                  await refreshPartners();
                  return {
                    message: `Imported ${result.imported} row${result.imported === 1 ? '' : 's'} (${result.created} created, ${result.updated} updated).`,
                  };
                }}
              />
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <CommissionPartnerTable
                rows={commissionRows}
                expandedPaySource={expandedPaySource}
                onToggle={setExpandedPaySource}
                onView={openCommissionPartnerDetail}
                onEdit={setEditPartner}
                customers={customers}
                onOpenCustomer={onOpenCustomer}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="comm-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <div className="comm-stat-card partners-stat-card">
              <div className="partners-stat-top">
                <div className="comm-stat-label">Saved to database</div>
                <HintBubble text="Persisted solution providers (BMW vendors auto-save on load)" />
              </div>
              <div className="comm-stat-value">{savedProviderCount}</div>
            </div>
            <div className="comm-stat-card partners-stat-card">
              <div className="partners-stat-top">
                <div className="comm-stat-label">With solutions</div>
                <HintBubble text="Commission rates configured" />
              </div>
              <div className="comm-stat-value">{providers.filter((p) => p.solutions.length > 0).length}</div>
            </div>
            <div className="comm-stat-card partners-stat-card">
              <div className="partners-stat-top">
                <div className="comm-stat-label">Active customer deals</div>
                <HintBubble text="Unique merchant+deal pairs where BmwDeal.activeDeal is true" />
              </div>
              <div className="comm-stat-value">{supplierCustomerCount}</div>
            </div>
          </div>

          <div className="card">
            <div className="card-header" style={{ gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  Suppliers & vendors
                  <HintBubble text="Actual solution providers (Comcast, Dialpad, Vonage, etc.) — sold through commission partners like Telarus" />
                </div>
              </div>
              <div className="partners-view-toggle" role="group" aria-label="List layout">
                <button
                  type="button"
                  className={listMode === 'table' ? 'is-active' : undefined}
                  onClick={() => setListModePersist('table')}
                >
                  Table
                </button>
                <button
                  type="button"
                  className={listMode === 'grid' ? 'is-active' : undefined}
                  onClick={() => setListModePersist('grid')}
                >
                  Grid
                </button>
              </div>
              <ImportExportControls
                hideCsv
                label="One row per solution/rate. Import updates or creates providers."
                onExportCsv={() => exportSolutionProvidersCsv(providers)}
                onExportXlsx={() => exportSolutionProvidersXlsx(providers)}
                onImport={async (file) => {
                  const result = await importSolutionProvidersFromFile(file, providers);
                  await refreshProviders();
                  return {
                    message: `Imported ${result.imported} provider${result.imported === 1 ? '' : 's'}.`,
                  };
                }}
              />
              <input
                type="search"
                value={providerSearch}
                onChange={(e) => setProviderSearch(e.target.value)}
                placeholder="Search providers…"
                style={{ border: '1px solid var(--gray-border)', borderRadius: 6, padding: '8px 12px', fontSize: 13, width: 220 }}
              />
              <button type="button" className="btn-primary" style={{ fontSize: 12, whiteSpace: 'nowrap' }} onClick={() => setAddProvider(true)}>
                + Add provider
              </button>
            </div>
            <div className="partners-filter-bar">
              <MultiSelectFilter
                ariaLabel="Filter by category"
                allLabel="All categories"
                options={PROVIDER_CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                selected={filters.categories}
                onChange={(categories) => patchFilter('categories', categories)}
              />
              <select
                className="partners-filter-select"
                aria-label="Filter by solutions"
                value={filters.hasSolutions}
                onChange={(e) => patchFilter('hasSolutions', e.target.value as TriFilter)}
              >
                <option value="any">Solutions: any</option>
                <option value="yes">Has solutions</option>
                <option value="no">No solutions</option>
              </select>
              <select
                className="partners-filter-select"
                aria-label="Filter by active deals"
                value={filters.hasActiveDeals}
                onChange={(e) => patchFilter('hasActiveDeals', e.target.value as TriFilter)}
              >
                <option value="any">Active deals: any</option>
                <option value="yes">Has active deals</option>
                <option value="no">No active deals</option>
              </select>
              <MultiSelectFilter
                ariaLabel="Filter by commission partner"
                allLabel="All commission partners"
                options={paySourceOptions.map((ps) => ({ value: ps, label: ps }))}
                selected={filters.paySources}
                onChange={(paySources) => patchFilter('paySources', paySources)}
              />
              {filtersActive && (
                <button type="button" className="btn-secondary partners-filter-clear" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
              <span className="partners-filter-count">
                {sortedProviders.length} of {providers.length}
              </span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {sortedProviders.length === 0 ? (
                <p style={{ padding: '20px 16px', fontSize: 13, color: 'var(--gray)' }}>
                  No providers match your search{filtersActive ? ' or filters' : ''}.
                </p>
              ) : listMode === 'grid' ? (
                <div className="partners-supplier-grid">
                  {sortedProviders.map((p) => {
                    const activeCount = dealsForProvider(p.name).filter((d) => isActiveCustomerDeal(d.activeDeal)).length;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`partners-supplier-card${selectedProviderId === p.id ? ' is-selected' : ''}`}
                        onClick={() => openProviderDetail(p)}
                      >
                        <SupplierLogo
                          vendor={p.displayName ?? p.name}
                          website={p.website}
                          logoUrl={p.logoUrl}
                          size={40}
                          variant="card"
                        />
                        <div className="partners-supplier-card-body">
                          <div className="partners-supplier-card-name">{p.displayName ?? p.name}</div>
                          <div className="partners-supplier-card-meta">
                            {providerCategoryLabel(p.providerCategory)}
                          </div>
                          <div className="partners-supplier-card-stats">
                            <span>{p.solutions.length} solutions</span>
                            <span>{activeCount} active deals</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <table className="admin-mini-table comm-table">
                  <thead>
                    <tr>
                      <SortableTh label="Provider" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                      <SortableTh label="Type" sortKey="type" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                      <SortableTh label="Solutions" sortKey="solutions" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                      <SortableTh label="Contacts" sortKey="contacts" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                      <SortableTh
                        label="Active deals"
                        sortKey="customers"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={toggleSort}
                        align="right"
                      />
                      <th style={{ width: 120 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProviders.map((p) => {
                      const activeCount = dealsForProvider(p.name).filter((d) => isActiveCustomerDeal(d.activeDeal)).length;
                      return (
                        <tr
                          key={p.id}
                          className="comm-row-clickable"
                          style={selectedProviderId === p.id ? { background: 'var(--gray-light)' } : undefined}
                          onClick={() => openProviderDetail(p)}
                        >
                          <td style={{ fontWeight: 600 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <SupplierLogo
                                vendor={p.displayName ?? p.name}
                                website={p.website}
                                logoUrl={p.logoUrl}
                                size={32}
                                variant="row"
                              />
                              <span>{p.displayName ?? p.name}</span>
                            </div>
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--gray)' }}>{providerCategoryLabel(p.providerCategory)}</td>
                          <td style={{ fontSize: 12 }}>{p.solutions.length}</td>
                          <td style={{ fontSize: 12 }}>{p.contacts.length}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{activeCount}</td>
                          <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ fontSize: 11, padding: '4px 10px', flex: 'none' }}
                                onClick={() => openProviderDetail(p)}
                              >
                                View
                              </button>
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ fontSize: 11, padding: '4px 10px', flex: 'none' }}
                                onClick={() => setEditProviderRecord(p)}
                              >
                                Edit
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {editPartner && (
        <EditCommissionPartnerModal
          row={editPartner}
          onClose={() => setEditPartner(null)}
          onSave={() => { setEditPartner(null); void refreshPartners(); }}
        />
      )}

      {editProviderRecord && (
        <EditSupplierModal
          provider={editProviderRecord}
          onClose={() => setEditProviderRecord(null)}
          onSave={(next) => {
            void refreshProviders().then(() => {
              setEditProviderRecord(null);
              setSelectedProviderId(next.id);
            });
          }}
        />
      )}

      {addProvider && (
        <EditSupplierModal
          provider={null}
          initialName={providerSearch}
          onClose={() => setAddProvider(false)}
          onSave={(next) => {
            void refreshProviders().then(() => {
              setSelectedProviderId(next.id);
              setAddProvider(false);
            });
          }}
        />
      )}
    </div>
  );
}

export default SuppliersView;
