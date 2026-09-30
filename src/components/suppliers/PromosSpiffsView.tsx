'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { SupplierLogo } from '@/components/SupplierLogo';
import { CampaignEditorDrawer } from '@/components/suppliers/CampaignEditorDrawer';
import { SpiffImportModal } from '@/components/suppliers/SpiffImportModal';
import {
  CAMPAIGN_SOURCE_LABEL,
  CAMPAIGN_STATUS_LABEL,
  campaignStatus,
  formatCampaignStructure,
  type CampaignInput,
  type CampaignSource,
  type CampaignStatus,
  type IncentiveCampaign,
} from '@/lib/incentive-campaigns';
import { fetchCampaigns, updateCampaign } from '@/lib/incentive-campaigns-client';
import { formatPromoExpiry } from '@/lib/member-promos';
import type { SolutionProviderRecord } from '@/lib/solution-providers-types';

type SourceFilter = 'all' | CampaignSource;
type StatusFilter = 'all' | CampaignStatus;
type SortKey = 'promo' | 'supplier' | 'source' | 'dates' | 'status' | 'order';

const STATUS_RANK: Record<CampaignStatus, number> = { active: 0, scheduled: 1, review: 2, ended: 3 };

function SortTh({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  align = 'left',
  style,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
  align?: 'left' | 'right' | 'center';
  style?: CSSProperties;
}) {
  const active = activeKey === sortKey;
  return (
    <th
      style={{ ...style, textAlign: align, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
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

type EditorState =
  | { mode: 'closed' }
  | { mode: 'new'; source: CampaignSource }
  | { mode: 'edit'; campaign: IncentiveCampaign };

function campaignToInput(c: IncentiveCampaign): CampaignInput {
  return {
    providerDbId: c.providerDbId,
    title: c.title,
    details: c.details ?? null,
    structureType: c.structureType ?? null,
    structureValue: c.structureValue ?? null,
    startsOn: c.startsOn ?? null,
    endsOn: c.endsOn ?? null,
    customerFacing: c.customerFacing,
    ctaLabel: c.ctaLabel ?? null,
    showInSlider: c.showInSlider,
    slideOrder: c.slideOrder,
    criteria: c.criteria ?? null,
  };
}

function formatWindow(c: IncentiveCampaign): string {
  if (c.startsOn && c.endsOn) return `${formatPromoExpiry(c.startsOn)} – ${formatPromoExpiry(c.endsOn)}`;
  if (c.endsOn) return `Until ${formatPromoExpiry(c.endsOn)}`;
  if (c.startsOn) return `From ${formatPromoExpiry(c.startsOn)}`;
  return 'No end date';
}

export function PromosSpiffsView({ providers }: { providers: SolutionProviderRecord[] }) {
  const [campaigns, setCampaigns] = useState<IncentiveCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' });
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const createMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!createMenuOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !createMenuRef.current?.contains(e.target as Node)) {
        setCreateMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [createMenuOpen]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCampaigns(await fetchCampaigns());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load promos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const providerByDbId = useMemo(() => {
    const map = new Map<number, SolutionProviderRecord>();
    for (const p of providers) if (p.dbId != null) map.set(p.dbId, p);
    return map;
  }, [providers]);

  const supplierName = useCallback(
    (dbId: number) => {
      const p = providerByDbId.get(dbId);
      return p ? p.displayName?.trim() || p.name : `Supplier #${dbId}`;
    },
    [providerByDbId],
  );

  const sourceCounts = useMemo(() => {
    const counts: Record<SourceFilter, number> = { all: campaigns.length, candid_promo: 0, supplier_spiff: 0 };
    for (const c of campaigns) counts[c.source] += 1;
    return counts;
  }, [campaigns]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = campaigns.filter((c) => {
      if (sourceFilter !== 'all' && c.source !== sourceFilter) return false;
      if (statusFilter !== 'all' && campaignStatus(c) !== statusFilter) return false;
      if (!q) return true;
      return `${c.title} ${c.details ?? ''} ${supplierName(c.providerDbId)}`.toLowerCase().includes(q);
    });
    const sortValue = (c: IncentiveCampaign): string | number => {
      switch (sortKey) {
        case 'promo':
          return c.title.toLowerCase();
        case 'supplier':
          return supplierName(c.providerDbId).toLowerCase();
        case 'source':
          return c.source;
        case 'dates':
          return c.endsOn ?? '9999-12-31';
        case 'status':
          return STATUS_RANK[campaignStatus(c)];
        case 'order':
          return c.slideOrder;
      }
    };
    const factor = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = sortValue(a);
      const bv = sortValue(b);
      if (av < bv) return -1 * factor;
      if (av > bv) return 1 * factor;
      return supplierName(a.providerDbId).localeCompare(supplierName(b.providerDbId));
    });
  }, [campaigns, sourceFilter, statusFilter, query, supplierName, sortKey, sortDir]);

  const filtersActive = sourceFilter !== 'all' || statusFilter !== 'all' || query.trim() !== '';
  const clearFilters = () => {
    setSourceFilter('all');
    setStatusFilter('all');
    setQuery('');
  };

  const upsert = (saved: IncentiveCampaign) => {
    setCampaigns((prev) => {
      const exists = prev.some((c) => c.id === saved.id);
      return exists ? prev.map((c) => (c.id === saved.id ? saved : c)) : [saved, ...prev];
    });
  };

  const toggleSlider = async (c: IncentiveCampaign) => {
    setTogglingId(c.id);
    setError(null);
    try {
      upsert(await updateCampaign(c.id, { ...campaignToInput(c), showInSlider: !c.showInSlider }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update slider');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="card">
      <div className="card-header" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="card-title">Promos & SPIFFs</div>
          <span className="partners-hint" tabIndex={0}>
            <span className="partners-hint-mark" aria-hidden>i</span>
            <span className="partners-hint-tip" role="tooltip">
              Customer-facing, active items appear on member supplier cards and in the Find Solutions slider.
            </span>
          </span>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search supplier or headline…"
          style={{ border: '1px solid var(--gray-border)', borderRadius: 6, padding: '8px 12px', fontSize: 13, width: 220 }}
        />
        <div ref={createMenuRef} style={{ position: 'relative', flex: 'none' }}>
          <button
            type="button"
            className="btn-primary"
            style={{ fontSize: 12, whiteSpace: 'nowrap' }}
            aria-haspopup="menu"
            aria-expanded={createMenuOpen}
            onClick={() => setCreateMenuOpen((o) => !o)}
          >
            + SPIFF / Promo ▾
          </button>
          {createMenuOpen ? (
            <div role="menu" className="promos-create-menu">
              {(
                [
                  ['Supplier SPIFF', () => setEditor({ mode: 'new', source: 'supplier_spiff' })],
                  ['Candid Promo', () => setEditor({ mode: 'new', source: 'candid_promo' })],
                  ['Import SPIFF', () => setImportOpen(true)],
                ] as const
              ).map(([label, action]) => (
                <button
                  key={label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setCreateMenuOpen(false);
                    action();
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="partners-filter-bar">
        <div className="comm-tabs" style={{ marginBottom: 0 }}>
          {(
            [
              ['all', 'All'],
              ['candid_promo', 'Candid promos'],
              ['supplier_spiff', 'Supplier SPIFFs'],
            ] as Array<[SourceFilter, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`comm-tab${sourceFilter === key ? ' active' : ''}`}
              onClick={() => setSourceFilter(key)}
            >
              {label} <span style={{ opacity: 0.6 }}>({sourceCounts[key]})</span>
            </button>
          ))}
        </div>
        <select
          className="partners-filter-select"
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          <option value="all">All statuses</option>
          {(Object.keys(CAMPAIGN_STATUS_LABEL) as CampaignStatus[]).map((s) => (
            <option key={s} value={s}>
              {CAMPAIGN_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        {filtersActive && (
          <button type="button" className="btn-secondary partners-filter-clear" onClick={clearFilters}>
            Clear filters
          </button>
        )}
        <span className="partners-filter-count">
          {rows.length} of {campaigns.length}
        </span>
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            margin: '12px 16px 0',
            padding: '10px 12px',
            borderRadius: 8,
            background: 'var(--amber-light)',
            color: 'var(--amber)',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      <div className="card-body" style={{ padding: 0 }}>
        {loading ? (
          <p style={{ padding: '20px 16px', margin: 0, fontSize: 13, color: 'var(--gray)' }}>Loading promos…</p>
        ) : rows.length === 0 ? (
          <p style={{ padding: '20px 16px', margin: 0, fontSize: 13, color: 'var(--gray)' }}>
            {campaigns.length === 0 ? 'No promos or SPIFFs yet.' : 'Nothing matches these filters.'}
          </p>
        ) : (
          <div className="comm-table-scroll">
            <table className="admin-mini-table comm-table">
              <thead>
                <tr>
                  <SortTh label="Supplier" sortKey="supplier" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortTh label="Promo" sortKey="promo" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortTh label="Source" sortKey="source" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                  <th>Structure</th>
                  <SortTh label="Dates" sortKey="dates" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                  <th style={{ textAlign: 'center' }}>Banner</th>
                  <th style={{ textAlign: 'center' }}>Slider</th>
                  <SortTh label="Order" sortKey="order" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const provider = providerByDbId.get(c.providerDbId);
                  const status = campaignStatus(c);
                  const name = supplierName(c.providerDbId);
                  return (
                    <tr key={c.id} className="comm-row-clickable" onClick={() => setEditor({ mode: 'edit', campaign: c })}>
                      <td style={{ fontWeight: 600, minWidth: 180 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <SupplierLogo
                            vendor={name}
                            website={provider?.website}
                            logoUrl={provider?.logoUrl}
                            size={32}
                            variant="row"
                          />
                          <span>{name}</span>
                        </div>
                      </td>
                      <td style={{ minWidth: 260, maxWidth: 420 }}>
                        <div style={{ fontWeight: 600 }}>{c.title}</div>
                        {c.details ? (
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--gray)',
                              lineHeight: 1.4,
                              marginTop: 2,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {c.details}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span className={`campaign-source-badge campaign-source-badge--${c.source}`}>
                          {CAMPAIGN_SOURCE_LABEL[c.source]}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, minWidth: 120, maxWidth: 200 }}>
                        {formatCampaignStructure(c) ?? <span style={{ color: 'var(--gray)' }}>Display only</span>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--gray)' }}>{formatWindow(c)}</td>
                      <td>
                        <span className={`campaign-status campaign-status--${status}`}>{CAMPAIGN_STATUS_LABEL[status]}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {c.bannerImageUrl ? (
                          <div className="campaign-thumb" style={{ margin: '0 auto' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={c.bannerImageUrl} alt="" />
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--gray)' }}>—</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Show ${c.title} in Find Solutions slider`}
                          checked={c.showInSlider}
                          disabled={togglingId === c.id}
                          onChange={() => void toggleSlider(c)}
                        />
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{c.slideOrder}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editor.mode !== 'closed' ? (
        <CampaignEditorDrawer
          key={editor.mode === 'edit' ? editor.campaign.id : `new-${editor.source}`}
          campaign={editor.mode === 'edit' ? editor.campaign : null}
          defaultSource={editor.mode === 'new' ? editor.source : undefined}
          providers={providers}
          onClose={() => setEditor({ mode: 'closed' })}
          onSaved={(saved) => {
            upsert(saved);
            setEditor({ mode: 'edit', campaign: saved });
          }}
          onDeleted={(id) => {
            setCampaigns((prev) => prev.filter((c) => c.id !== id));
            setEditor({ mode: 'closed' });
          }}
        />
      ) : null}

      {importOpen ? (
        <SpiffImportModal
          providers={providers}
          existingCampaigns={campaigns}
          onClose={() => setImportOpen(false)}
          onImported={() => void load()}
        />
      ) : null}
    </div>
  );
}
