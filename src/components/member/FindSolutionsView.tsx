'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { SupplierLogo } from '@/components/SupplierLogo';
import { supplierEarningsBadge } from '@/lib/solutions/supplier-earnings';
import { PromoSlider } from '@/components/member/PromoSlider';
import { openSupplierReferral } from '@/lib/member-referral-client';
import { SupplierDetailModal } from '@/components/member/SupplierDetailModal';
import { GuidedSearchPanel, type GuidedPanelMode } from '@/components/member/GuidedSearchPanel';
import { toggleInterested, useInterested } from '@/lib/member-interested-client';
import { normSupplierName, useProductMatches, type ProductMatchSupplier } from '@/lib/member-product-search-client';
import {
  memberPromoBadge,
  type MemberPromo,
  type MemberPromoSlide,
} from '@/lib/member-promos';
import {
  solutionCategoryLabel,
  type CatalogSupplier,
  type SolutionCategoryId,
} from '@/lib/solutions/catalog';
import {
  buildMergedSuppliers,
  filterSuppliers,
  primaryCategory,
  PRODUCT_MATRIX,
  sortSuppliers,
  SOLUTION_CATEGORIES,
  type FindSolutionsSort,
  type FindSolutionsViewMode,
  type MatrixCard,
  type MergedSolutionSupplier,
} from '@/lib/solutions/supplier-matrix';

const VIEW_TABS: { id: FindSolutionsViewMode; label: string }[] = [
  { id: 'browse', label: 'Browse catalog' },
  { id: 'matrix', label: 'Product matrix' },
];

function pickMatrixCard(
  supplier: MergedSolutionSupplier,
  category: SolutionCategoryId | 'all',
): MatrixCard | undefined {
  if (category === 'ucaas') return supplier.ucaas ?? supplier.ccaas;
  if (category === 'contact_center') return supplier.ccaas ?? supplier.ucaas;
  return supplier.ucaas ?? supplier.ccaas;
}

const SORT_OPTIONS: { id: FindSolutionsSort; label: string }[] = [
  { id: 'cashback-desc', label: 'Highest cash back' },
  { id: 'recommended-first', label: 'Candid recommended first' },
  { id: 'name-asc', label: 'Name — A to Z' },
  { id: 'name-desc', label: 'Name — Z to A' },
  { id: 'network-first', label: 'Candid network first' },
  { id: 'products-desc', label: 'Most product coverage' },
];

function supplierPromos(supplier: MergedSolutionSupplier): MemberPromo[] {
  return supplier.promos ?? [];
}

function sourceBadge(supplier: MergedSolutionSupplier): { cls: string; label: string } {
  if (supplier.buyMode === 'referral') return { cls: 'direct', label: 'Direct from supplier' };
  return supplier.source === 'candid'
    ? { cls: 'candid', label: 'In Candid network' }
    : { cls: 'network', label: 'Available via Candid' };
}

function SupplierCard({
  supplier,
  shortlisted,
  onToggleShortlist,
  onViewDetails,
  onOrder,
  offers,
}: {
  supplier: MergedSolutionSupplier;
  offers?: ProductMatchSupplier;
  shortlisted: boolean;
  onToggleShortlist: () => void;
  onViewDetails: () => void;
  onOrder: () => void;
}) {
  const earnings = supplierEarningsBadge(supplier);
  const promoBadge = memberPromoBadge(supplierPromos(supplier));
  const source = sourceBadge(supplier);
  const isReferral = supplier.buyMode === 'referral';

  return (
    <article
      className={`fs-supplier fs-page-supplier-card fs-card-simple${
        supplier.candidRecommended ? ' fs-page-supplier-card--recommended' : ''
      }`}
    >
      {supplier.candidRecommended && (
        <span
          className="fs-card-recommended"
          role="img"
          aria-label="Candid recommended"
          data-tooltip="Candid recommended"
        >
          <AppIcon name="star" size={12} />
        </span>
      )}

      <div className="fs-page-supplier-top">
        <SupplierLogo
          vendor={supplier.name}
          website={supplier.website}
          logoUrl={supplier.logoUrl}
          size={40}
          variant="card"
        />
        <div className="fs-supplier-head">
          <div className="fs-supplier-name">{supplier.name}</div>
          {supplier.description && <p className="fs-page-supplier-desc fs-card-desc">{supplier.description}</p>}
        </div>
      </div>

      {(earnings || promoBadge) && (
        <div className="fs-card-badges">
          {earnings && <span className="fs-badge fs-badge--cashback">{earnings}</span>}
          {promoBadge && <span className="fs-badge fs-badge--promo">{promoBadge}</span>}
        </div>
      )}
      <div className="fs-card-badges">
        <span className={`fs-badge fs-badge--${source.cls}`}>{source.label}</span>
      </div>
      {offers && offers.products.length > 0 && (
        <p className="fs-card-offers">
          <span className="fs-card-offers-label">Offers</span> {offers.products.slice(0, 2).join(', ')}
          {offers.matchCount > 2 && <span className="fs-card-offers-more"> +{offers.matchCount - 2} more</span>}
        </p>
      )}

      <div className="fs-card-actions">
        <button type="button" className="fs-card-btn" onClick={onViewDetails}>
          View details
        </button>
        {isReferral ? (
          <button type="button" className="fs-card-btn fs-card-btn--primary" onClick={onOrder}>
            Order <AppIcon name="external" size={11} />
          </button>
        ) : (
          <button
            type="button"
            className={`fs-card-btn fs-card-btn--primary${shortlisted ? ' is-on' : ''}`}
            onClick={onToggleShortlist}
            aria-pressed={shortlisted}
          >
            {shortlisted ? '✓ Interested' : '+ Interested'}
          </button>
        )}
      </div>
    </article>
  );
}

const FILTERS_HIDDEN_KEY = 'candid:find-solutions:filters-hidden';

export default function FindSolutionsView({
  onRequestQuote,
  onBuildQuoteFromShortlist,
  onOpenInterested,
  openSupplierRequest,
}: {
  onRequestQuote: (category: SolutionCategoryId, supplier?: string) => void;
  onBuildQuoteFromShortlist?: (vendorNames: string[], categoryId?: SolutionCategoryId) => void;
  onOpenInterested?: () => void;
  /** Opens a supplier's detail window (e.g. picked from the top-bar search); nonce re-triggers the same name. */
  openSupplierRequest?: { name: string; nonce: number } | null;
}) {
  const [systemSuppliers, setSystemSuppliers] = useState<CatalogSupplier[]>([]);
  const [promoSlides, setPromoSlides] = useState<MemberPromoSlide[]>([]);
  const [detail, setDetail] = useState<{ name: string; promoId?: string } | null>(null);
  const interested = useInterested();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<FindSolutionsSort>('cashback-desc');
  const [categoryFilter, setCategoryFilter] = useState<SolutionCategoryId | 'all'>('all');
  const [viewMode, setViewMode] = useState<FindSolutionsViewMode>('browse');
  const [featureFilters, setFeatureFilters] = useState<Set<string>>(new Set());
  const [networkOnly, setNetworkOnly] = useState(false);
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitIntents, setSubmitIntents] = useState<Set<string>>(new Set());
  const [submitNote, setSubmitNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<GuidedPanelMode>('guided');
  const [panelKey, setPanelKey] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const resultsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (window.localStorage.getItem(FILTERS_HIDDEN_KEY) === '1') setFiltersOpen(false);
  }, []);

  useEffect(() => {
    if (openSupplierRequest) setDetail({ name: openSupplierRequest.name });
  }, [openSupplierRequest]);

  const toggleFilters = () =>
    setFiltersOpen((open) => {
      window.localStorage.setItem(FILTERS_HIDDEN_KEY, open ? '1' : '0');
      return !open;
    });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/portal/solutions');
        if (!res.ok) return;
        const json = (await res.json()) as { suppliers?: CatalogSupplier[]; slides?: MemberPromoSlide[] };
        if (cancelled) return;
        setSystemSuppliers(json.suppliers ?? []);
        setPromoSlides(json.slides ?? []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const mergedSuppliers = useMemo(() => buildMergedSuppliers(systemSuppliers), [systemSuppliers]);

  const productColumns = useMemo(() => {
    const set = new Set<string>(PRODUCT_MATRIX.columns);
    for (const s of mergedSuppliers) {
      for (const svc of s.services ?? []) set.add(svc);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [mergedSuppliers]);

  const categoryPool = useMemo(() => {
    if (categoryFilter === 'all') return mergedSuppliers;
    return mergedSuppliers.filter((s) => s.categories.includes(categoryFilter));
  }, [mergedSuppliers, categoryFilter]);

  const capabilityOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of categoryPool) {
      for (const c of s.capabilities ?? []) set.add(c);
      if (!(s.capabilities?.length) && !(s.services?.length)) {
        for (const f of s.features) set.add(f);
      }
    }
    return [...set].filter((f) => !productColumns.includes(f)).sort((a, b) => a.localeCompare(b));
  }, [categoryPool, productColumns]);

  const productMatches = useProductMatches(query);
  const offersFor = useMemo(() => {
    const byId = new Map<number, ProductMatchSupplier>();
    const byName = new Map<string, ProductMatchSupplier>();
    for (const m of productMatches) {
      if (m.providerId != null) byId.set(m.providerId, m);
      byName.set(normSupplierName(m.name), m);
    }
    return (s: MergedSolutionSupplier) =>
      (s.providerId != null ? byId.get(s.providerId) : undefined) ?? byName.get(normSupplierName(s.name));
  }, [productMatches]);

  const filtered = useMemo(() => {
    const opts = {
      query,
      category: categoryFilter,
      features: [...featureFilters],
      viewMode,
      networkOnly,
      recommendedOnly,
    };
    const list = filterSuppliers(mergedSuppliers, opts);
    if (query.trim() && productMatches.length) {
      const seen = new Set(list.map((s) => s.name));
      // A named product outranks the category filter: who sells it matters more than how we file them.
      for (const s of filterSuppliers(mergedSuppliers, { ...opts, query: '', category: 'all' })) {
        if (!seen.has(s.name) && offersFor(s)) list.push(s);
      }
    }
    return sortSuppliers(list, sort);
  }, [
    mergedSuppliers,
    productMatches,
    offersFor,
    query,
    categoryFilter,
    featureFilters,
    viewMode,
    networkOnly,
    recommendedOnly,
    sort,
  ]);

  const filtersActive =
    query.trim().length > 0 ||
    categoryFilter !== 'all' ||
    featureFilters.size > 0 ||
    networkOnly ||
    recommendedOnly;

  const openPanel = useCallback((mode: GuidedPanelMode) => {
    setPanelMode(mode);
    setPanelOpen(true);
    setPanelKey((n) => n + 1);
  }, []);

  const closePanel = useCallback(() => setPanelOpen(false), []);

  const seeAllMatches = () => {
    setPanelOpen(false);
    const el = resultsRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 60 - 64 - 12;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };

  const setBrowseCategory = (id: SolutionCategoryId | 'all') => {
    setCategoryFilter(id);
    setFeatureFilters(new Set());
  };

  const toggleFeature = (f: string) =>
    setFeatureFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  const toggleShortlist = (s: MergedSolutionSupplier) => {
    void toggleInterested({ name: s.name, category: primaryCategory(s), providerId: s.providerId });
  };
  const shortlistNames = interested.items.map((i) => i.name);
  const shortlistSuppliers = useMemo(
    () =>
      interested.items
        .map((i) => mergedSuppliers.find((s) => s.name.toLowerCase() === i.name.toLowerCase()))
        .filter((s): s is MergedSolutionSupplier => Boolean(s)),
    [interested.items, mergedSuppliers],
  );
  const featureList = useMemo(() => [...featureFilters], [featureFilters]);

  const toggleIntent = (id: string) =>
    setSubmitIntents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submitShortlist = async () => {
    setSubmitting(true);
    const names = shortlistNames;
    const intents = [...submitIntents];
    try {
      await fetch('/api/portal/quote-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'request',
          services: names,
          note: ['Find Solutions shortlist', intents.join(', '), submitNote.trim()].filter(Boolean).join(' — '),
        }),
      });
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  const clearFilters = () => {
    setQuery('');
    setCategoryFilter('all');
    setFeatureFilters(new Set());
    setNetworkOnly(false);
    setRecommendedOnly(false);
  };

  const viewPromoOffer = (slide: MemberPromoSlide) => {
    setDetail({ name: slide.supplierName, promoId: slide.id });
  };

  const detailSupplier = detail
    ? mergedSuppliers.find((s) => s.name.toLowerCase() === detail.name.toLowerCase()) ?? null
    : null;

  return (
    <div
      className={`fs-page${panelOpen ? ' fs-page--panel-open' : ''}${!filtersOpen && !panelOpen ? ' fs-page--filters-hidden' : ''}`}
    >
      <PromoSlider slides={promoSlides} onViewOffer={viewPromoOffer} />

      {detailSupplier && (
        <SupplierDetailModal
          supplier={detailSupplier}
          matrixCard={pickMatrixCard(detailSupplier, categoryFilter)}
          cashBackBadge={supplierEarningsBadge(detailSupplier)}
          highlightPromoId={detail?.promoId}
          interested={interested.has(detailSupplier.name)}
          onToggleInterested={() => toggleShortlist(detailSupplier)}
          primaryAction={
            detailSupplier.buyMode === 'referral'
              ? { label: 'Order here', onClick: () => openSupplierReferral(detailSupplier.providerId) }
              : {
                  label: 'Get a quote →',
                  onClick: () => {
                    setDetail(null);
                    onRequestQuote(primaryCategory(detailSupplier), detailSupplier.name);
                  },
                }
          }
          onClose={() => setDetail(null)}
        />
      )}

      <div className="fs-page-modebar fs-page-stickybar">
        <div className="fs-mode-tabs" role="tablist" aria-label="Results view">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={viewMode === tab.id}
              className={`fs-mode-tab${viewMode === tab.id ? ' is-on' : ''}`}
              onClick={() => setViewMode(tab.id)}
            >
              <AppIcon name={tab.id === 'matrix' ? 'chart' : 'dashboard'} size={13} /> {tab.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`fs-stickybar-filter${filtersOpen && !panelOpen ? ' is-on' : ''}`}
          aria-pressed={filtersOpen && !panelOpen}
          aria-label={filtersOpen ? 'Hide filters' : 'Show filters'}
          title={filtersOpen ? 'Hide filters' : 'Show filters'}
          disabled={panelOpen}
          onClick={toggleFilters}
        >
          <AppIcon name="filter" size={13} />
          {filtersActive ? <span className="fs-stickybar-filter-dot" aria-hidden /> : null}
        </button>
        <div className="fs-stickybar-search">
          <AppIcon name="search" size={13} />
          <input
            type="search"
            placeholder="Search suppliers…"
            aria-label="Search suppliers"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          className={`fs-stickybar-guided${panelOpen ? ' is-on' : ''}`}
          aria-pressed={panelOpen}
          aria-expanded={panelOpen}
          onClick={() => (panelOpen ? closePanel() : openPanel('guided'))}
        >
          <AppIcon name={panelOpen ? 'close' : 'hank'} size={13} />
          {panelOpen ? 'Close guided search' : 'Start guided search'}
        </button>
      </div>

      <div className="fs-page-layout">
        {!panelOpen && filtersOpen && (
          <aside className="fs-page-sidebar">
            <div className="fs-page-sidebar-title">Filters</div>

            <label className="fs-page-filter-label">
              Sort by
              <select
                className="fs-page-select"
                value={sort}
                onChange={(e) => setSort(e.target.value as FindSolutionsSort)}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="fs-page-filter-group">
              <div className="fs-page-filter-heading">Categories</div>
              <div className="fs-sidebar-cats" role="listbox" aria-label="Solution categories">
                <button
                  type="button"
                  role="option"
                  aria-selected={categoryFilter === 'all'}
                  className={`fs-sidebar-cat${categoryFilter === 'all' ? ' is-on' : ''}`}
                  onClick={() => setBrowseCategory('all')}
                >
                  All solutions
                </button>
                {SOLUTION_CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="option"
                    aria-selected={categoryFilter === c.id}
                    className={`fs-sidebar-cat${categoryFilter === c.id ? ' is-on' : ''}`}
                    onClick={() => setBrowseCategory(c.id)}
                    title={c.blurb}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="fs-page-check">
              <input type="checkbox" checked={networkOnly} onChange={(e) => setNetworkOnly(e.target.checked)} />
              In Candid network only
            </label>

            <label className="fs-page-check">
              <input
                type="checkbox"
                checked={recommendedOnly}
                onChange={(e) => setRecommendedOnly(e.target.checked)}
              />
              Candid recommended only
            </label>

            {capabilityOptions.length > 0 && (
              <div className="fs-page-filter-group">
                <div className="fs-page-filter-heading">Capabilities</div>
                <div className="fs-page-check-list fs-page-check-list--scroll">
                  {capabilityOptions.map((f) => (
                    <label key={f} className="fs-page-check">
                      <input type="checkbox" checked={featureFilters.has(f)} onChange={() => toggleFeature(f)} />
                      {f}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="fs-page-filter-group">
              <div className="fs-page-filter-heading">Products &amp; services</div>
              <div className="fs-page-check-list fs-page-check-list--scroll">
                {productColumns.map((f) => (
                  <label key={f} className="fs-page-check">
                    <input type="checkbox" checked={featureFilters.has(f)} onChange={() => toggleFeature(f)} />
                    {f}
                  </label>
                ))}
              </div>
            </div>

            {filtersActive && (
              <button type="button" className="fs-page-clear" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </aside>
        )}

        <main className="fs-page-main" ref={resultsRef}>
          <div className="fs-page-results-head">
            <div className="fs-page-results-meta">
              <div className="fs-page-filter-chips">
                {categoryFilter !== 'all' && (
                  <button
                    type="button"
                    className="fs-filter-chip is-on"
                    onClick={() => setBrowseCategory('all')}
                    title="Back to all solutions"
                  >
                    {solutionCategoryLabel(categoryFilter)} ×
                  </button>
                )}
                {[...featureFilters].map((f) => (
                  <button
                    key={f}
                    type="button"
                    className="fs-filter-chip is-on"
                    onClick={() => toggleFeature(f)}
                  >
                    {f} ×
                  </button>
                ))}
                {panelOpen && filtersActive && (
                  <button type="button" className="fs-page-clear" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
              </div>
              <div className="fs-page-results-end">
                <span className="fs-page-count">
                  {filtered.length} supplier{filtered.length === 1 ? '' : 's'}
                </span>
                <span className="fs-page-cashback-hint--inline">
                  <strong>Cash back</strong> = rewards through Candid · <strong>Promo</strong> = extra supplier offer
                </span>
              </div>
            </div>
          </div>

        {viewMode === 'matrix' ? (
            <div className="fs-page-matrix-wrap">
              <table className="fs-page-matrix-table">
                <thead>
                  <tr>
                    <th className="fs-page-matrix-sn">Supplier</th>
                    {PRODUCT_MATRIX.columns.map((col) => (
                      <th key={col}>{col}</th>
                    ))}
                    <th className="fs-page-matrix-tot">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const row = s.productMatrix;
                    const cat = primaryCategory(s);
                    const offered = new Set(row?.products ?? []);
                    return (
                      <tr
                        key={s.name}
                        className={s.candidRecommended ? 'fs-page-matrix-row--recommended' : undefined}
                      >
                        <td className="fs-page-matrix-sn">
                          <div className="fs-page-matrix-name">
                            <div className="fs-page-matrix-actions">
                              <button
                                type="button"
                                className={`fs-interest-btn${interested.has(s.name) ? ' active' : ''}`}
                                onClick={() => toggleShortlist(s)}
                                aria-label={interested.has(s.name) ? 'Remove from Interested' : 'Add to Interested'}
                                title={interested.has(s.name) ? 'Interested' : 'Add to Interested'}
                              >
                                {interested.has(s.name) ? '✓' : '+'}
                              </button>
                              {s.buyMode === 'referral' ? (
                                <button
                                  type="button"
                                  className="fs-quote-btn fs-page-matrix-quote"
                                  onClick={() => openSupplierReferral(s.providerId)}
                                >
                                  Order
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="fs-quote-btn fs-page-matrix-quote"
                                  onClick={() => onRequestQuote(cat, s.name)}
                                >
                                  Quote
                                </button>
                              )}
                            </div>
                            <SupplierLogo
                              vendor={s.name}
                              website={s.website}
                              logoUrl={s.logoUrl}
                              size={28}
                              variant="row"
                            />
                            <span className="fs-page-matrix-name-text">{s.name}</span>
                            {supplierEarningsBadge(s) && (
                              <span className="fs-badge fs-badge--cashback">
                                {supplierEarningsBadge(s)}
                              </span>
                            )}
                            {memberPromoBadge(supplierPromos(s)) && (
                              <span className="fs-badge fs-badge--promo">
                                {memberPromoBadge(supplierPromos(s))}
                              </span>
                            )}
                            {s.candidRecommended && (
                              <span className="fs-badge fs-badge--recommended">Recommended</span>
                            )}
                          </div>
                        </td>
                        {PRODUCT_MATRIX.columns.map((col) => (
                          <td key={col} className={offered.has(col) ? 'fs-page-matrix-yes' : 'fs-page-matrix-no'}>
                            {offered.has(col) ? '✓' : '·'}
                          </td>
                        ))}
                        <td className="fs-page-matrix-tot">{row?.total ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="fs-page-grid">
              {filtered.map((s) => (
                <SupplierCard
                  key={`${s.name}-${s.source}`}
                  supplier={s}
                  offers={query.trim() ? offersFor(s) : undefined}
                  shortlisted={interested.has(s.name)}
                  onToggleShortlist={() => toggleShortlist(s)}
                  onViewDetails={() => setDetail({ name: s.name })}
                  onOrder={() => openSupplierReferral(s.providerId)}
                />
              ))}
            </div>
          )}

          {filtered.length === 0 && (
            <div className="fs-page-empty">
              No suppliers match your filters. Try clearing filters
              {panelOpen ? ' or tell Frank what matters most.' : ' or start guided search.'}
            </div>
          )}
        </main>
      </div>

      {shortlistNames.length > 0 && !submitted && (
        <div className="fs-shortlist-bar fs-page-shortlist">
          <div className="fs-shortlist-info">
            <strong>{shortlistNames.length} interested</strong>
            <span className="fs-shortlist-names">{shortlistNames.join(', ')}</span>
          </div>
          <div className="fs-shortlist-actions">
            {onOpenInterested && (
              <button type="button" className="fs-ask-btn fs-ask-btn--outline" onClick={onOpenInterested}>
                <AppIcon name="cart" size={13} /> View list
              </button>
            )}
            <button type="button" className="fs-ask-btn fs-ask-btn--ai" onClick={() => openPanel('recommend')}>
              <AppIcon name="hank" size={13} /> Recommend for me
            </button>
            {onBuildQuoteFromShortlist ? (
              <button
                type="button"
                className="fs-quote-btn"
                onClick={() => onBuildQuoteFromShortlist(shortlistNames, interested.items[0]?.category)}
              >
                Build quote request →
              </button>
            ) : (
              <button type="button" className="fs-quote-btn" onClick={() => setSubmitOpen((v) => !v)}>
                Submit request →
              </button>
            )}
          </div>
        </div>
      )}

      {submitOpen && shortlistNames.length > 0 && !submitted && (
        <div className="fs-submit-panel fs-page-submit">
          <div className="fs-submit-title">What would you like to do with your shortlist?</div>
          <div className="fs-submit-intents">
            {[
              { id: 'learn-more', label: 'Learn more' },
              { id: 'get-quotes', label: 'Get quotes' },
              { id: 'schedule-meeting', label: 'Schedule a meeting' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`fs-intent-chip${submitIntents.has(opt.id) ? ' active' : ''}`}
                onClick={() => toggleIntent(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <textarea
            className="fs-submit-note"
            value={submitNote}
            onChange={(e) => setSubmitNote(e.target.value)}
            rows={2}
            placeholder="Anything specific? (timeline, must-haves, number of users…)"
          />
          <button
            type="button"
            className="fs-quote-btn fs-submit-go"
            onClick={() => void submitShortlist()}
            disabled={submitting || submitIntents.size === 0}
          >
            {submitting ? 'Sending…' : 'Send to Candid →'}
          </button>
        </div>
      )}

      {submitted && (
        <div className="fs-submit-done fs-page-submit-done">
          <AppIcon name="check" size={16} /> Sent! A Candid specialist will follow up on your shortlist shortly.
        </div>
      )}

      <GuidedSearchPanel
        open={panelOpen}
        mode={panelMode}
        openKey={panelKey}
        suppliers={mergedSuppliers}
        matches={filtered}
        shortlist={shortlistSuppliers}
        category={categoryFilter}
        mustHaves={featureList}
        onCategory={setBrowseCategory}
        onMustHaves={(list) => setFeatureFilters(new Set(list))}
        isInterested={(name) => interested.has(name)}
        onToggleInterested={toggleShortlist}
        onViewDetails={(name) => setDetail({ name })}
        onOrder={(s) => openSupplierReferral(s.providerId)}
        onBuildQuote={(s) =>
          onBuildQuoteFromShortlist
            ? onBuildQuoteFromShortlist([s.name], primaryCategory(s))
            : onRequestQuote(primaryCategory(s), s.name)
        }
        onSeeAll={seeAllMatches}
        onClose={closePanel}
        onProductQuery={setQuery}
        offersFor={query.trim() ? offersFor : undefined}
      />
    </div>
  );
}
