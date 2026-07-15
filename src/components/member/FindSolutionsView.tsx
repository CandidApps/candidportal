'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { SupplierLogo } from '@/components/SupplierLogo';
import { callHankAPI, HANK_CORE_PROMPT } from '@/lib/candid-data';
import {
  solutionCategoryLabel,
  type CatalogSupplier,
  type SolutionCategoryId,
} from '@/lib/solutions/catalog';
import {
  allFeatureFilterOptions,
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

type HankMsg = { type: 'user' | 'bot'; text: string };

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
  { id: 'recommended-first', label: 'Candid recommended first' },
  { id: 'name-asc', label: 'Name — A to Z' },
  { id: 'name-desc', label: 'Name — Z to A' },
  { id: 'network-first', label: 'Candid network first' },
  { id: 'products-desc', label: 'Most product coverage' },
];

function MatrixMeta({ card }: { card: MatrixCard }) {
  return (
    <div className="fs-page-matrix-meta">
      <div className="fs-page-matrix-stats">
        <span>
          <strong>Stack</strong> {card.stack}
        </span>
        <span>
          <strong>Min seats</strong> {card.minSeats}
        </span>
      </div>
      <div className="fs-page-pills">
        {card.featurePills.map((p) => (
          <span
            key={p.label}
            className={`fs-page-pill${p.offered ? ' fs-page-pill--on' : ' fs-page-pill--off'}`}
          >
            {p.offered ? '✓' : '✗'} {p.label}
          </span>
        ))}
      </div>
      {Object.keys(card.details).length > 0 && (
        <div className="fs-page-details">
          {Object.entries(card.details).map(([k, v]) => (
            <div key={k}>
              <span className="fs-page-detail-label">{k}</span>
              <span className="fs-page-detail-val">{v}</span>
            </div>
          ))}
        </div>
      )}
      {(card.crmIntegrations.length > 0 || card.compliance.length > 0) && (
        <div className="fs-page-tags">
          {card.crmIntegrations.map((t) => (
            <span key={`crm-${t}`} className="fs-page-tag fs-page-tag--crm">
              {t}
            </span>
          ))}
          {card.compliance.map((t) => (
            <span key={`cmp-${t}`} className="fs-page-tag fs-page-tag--cmp">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SupplierCard({
  supplier,
  categoryFilter,
  shortlisted,
  onToggleShortlist,
  onRequestQuote,
}: {
  supplier: MergedSolutionSupplier;
  categoryFilter: SolutionCategoryId | 'all';
  shortlisted: boolean;
  onToggleShortlist: () => void;
  onRequestQuote: () => void;
}) {
  const matrixCard = pickMatrixCard(supplier, categoryFilter);

  const serviceChips =
    supplier.services && supplier.services.length > 0
      ? supplier.services
      : !matrixCard
        ? supplier.matrixFeatures
        : [];

  return (
    <article
      className={`fs-supplier fs-page-supplier-card${
        supplier.candidRecommended ? ' fs-page-supplier-card--recommended' : ''
      }`}
    >
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
          <div className="fs-page-supplier-badges">
            {supplier.candidRecommended && (
              <span className="fs-badge fs-badge--recommended">Candid recommended</span>
            )}
            <span className={`fs-badge fs-badge--${supplier.source}`}>
              {supplier.source === 'candid' ? 'In Candid network' : 'Available via Candid'}
            </span>
          </div>
        </div>
      </div>

      {supplier.description && <p className="fs-page-supplier-desc">{supplier.description}</p>}

      {supplier.features.length > 0 && (
        <ul className="fs-feature-list">
          {supplier.features.map((f, i) => (
            <li key={i}>
              <AppIcon name="check" size={11} /> {f}
            </li>
          ))}
        </ul>
      )}

      {matrixCard && <MatrixMeta card={matrixCard} />}

      {serviceChips.length > 0 && (
        <div className="fs-page-product-chips">
          {serviceChips.slice(0, 8).map((f) => (
            <span key={f} className="fs-page-tag fs-page-tag--product">
              {f}
            </span>
          ))}
          {serviceChips.length > 8 && (
            <span className="fs-page-tag fs-page-tag--more">+{serviceChips.length - 8} more</span>
          )}
        </div>
      )}

      <div className="fs-supplier-foot">
        <span className="fs-price">{supplier.pricing ?? 'Custom pricing — we negotiate it'}</span>
        <div className="fs-supplier-actions">
          {supplier.website && (
            <a className="fs-link-btn" href={supplier.website} target="_blank" rel="noreferrer">
              <AppIcon name="link" size={11} /> Site
            </a>
          )}
          <button
            type="button"
            className={`fs-interest-btn${shortlisted ? ' active' : ''}`}
            onClick={onToggleShortlist}
            aria-pressed={shortlisted}
          >
            {shortlisted ? '★ Shortlisted' : '☆ Interested'}
          </button>
          <button type="button" className="fs-quote-btn" onClick={onRequestQuote}>
            Get a quote →
          </button>
        </div>
      </div>
    </article>
  );
}

export default function FindSolutionsView({
  onRequestQuote,
  onBuildQuoteFromShortlist,
}: {
  onRequestQuote: (category: SolutionCategoryId, supplier?: string) => void;
  onBuildQuoteFromShortlist?: (vendorNames: string[], categoryId?: SolutionCategoryId) => void;
}) {
  const [systemSuppliers, setSystemSuppliers] = useState<CatalogSupplier[]>([]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<FindSolutionsSort>('recommended-first');
  const [categoryFilter, setCategoryFilter] = useState<SolutionCategoryId | 'all'>('all');
  const [viewMode, setViewMode] = useState<FindSolutionsViewMode>('browse');
  const [featureFilters, setFeatureFilters] = useState<Set<string>>(new Set());
  const [networkOnly, setNetworkOnly] = useState(false);
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const [shortlist, setShortlist] = useState<Map<string, { name: string; category: SolutionCategoryId }>>(new Map());
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitIntents, setSubmitIntents] = useState<Set<string>>(new Set());
  const [submitNote, setSubmitNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hankInput, setHankInput] = useState('');
  const [hankLoading, setHankLoading] = useState(false);
  const [hankMessages, setHankMessages] = useState<HankMsg[]>([]);
  const [hankConversation, setHankConversation] = useState<{ role: string; content: string }[]>([]);
  const hankListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/portal/solutions');
        if (!res.ok) return;
        const json = (await res.json()) as { suppliers?: CatalogSupplier[] };
        if (!cancelled) setSystemSuppliers(json.suppliers ?? []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    hankListRef.current?.scrollTo(0, hankListRef.current.scrollHeight);
  }, [hankMessages, hankLoading]);

  const mergedSuppliers = useMemo(() => buildMergedSuppliers(systemSuppliers), [systemSuppliers]);

  const featureOptions = useMemo(() => allFeatureFilterOptions(mergedSuppliers), [mergedSuppliers]);

  const productColumns = useMemo(() => {
    const set = new Set<string>(PRODUCT_MATRIX.columns);
    for (const s of mergedSuppliers) {
      for (const svc of s.services ?? []) set.add(svc);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [mergedSuppliers]);

  const capabilityOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of mergedSuppliers) {
      for (const c of s.capabilities ?? []) set.add(c);
      if (!(s.capabilities?.length) && !(s.services?.length)) {
        for (const f of s.features) set.add(f);
      }
    }
    for (const f of featureOptions) {
      if (!productColumns.includes(f)) set.add(f);
    }
    return [...set].filter((f) => !productColumns.includes(f)).sort((a, b) => a.localeCompare(b));
  }, [mergedSuppliers, featureOptions, productColumns]);

  const filtered = useMemo(() => {
    const list = filterSuppliers(mergedSuppliers, {
      query,
      category: categoryFilter,
      features: [...featureFilters],
      viewMode,
      networkOnly,
      recommendedOnly,
    });
    return sortSuppliers(list, sort);
  }, [
    mergedSuppliers,
    query,
    categoryFilter,
    featureFilters,
    viewMode,
    networkOnly,
    recommendedOnly,
    sort,
  ]);

  const hankSystemPrompt = useMemo(() => {
    const names = filtered.slice(0, 15).map((s) => s.name).join(', ');
    const filters = [
      categoryFilter !== 'all' ? solutionCategoryLabel(categoryFilter) : null,
      featureFilters.size ? [...featureFilters].join(', ') : null,
      query.trim() || null,
    ]
      .filter(Boolean)
      .join('; ');
    return `${HANK_CORE_PROMPT}

CONTEXT: The customer is on the Find Solutions page in the member portal.${
      filters ? ` Active filters: ${filters}.` : ''
    }${
      names ? ` Visible suppliers (${filtered.length} total, showing names): ${names}.` : ''
    } Recommend options based on their needs. Quote requests go through Candid — not direct to suppliers. If they describe requirements, suggest specific suppliers from this list and explain why.`;
  }, [filtered, categoryFilter, featureFilters, query]);

  const sendHank = useCallback(
    async (text?: string) => {
      const msg = (text ?? hankInput).trim();
      if (!msg || hankLoading) return;
      setHankInput('');
      setHankLoading(true);
      setHankMessages((prev) => [...prev, { type: 'user', text: msg }]);
      const historyWithUser = [...hankConversation, { role: 'user', content: msg }];
      try {
        const reply = await callHankAPI(historyWithUser, { systemPrompt: hankSystemPrompt });
        setHankConversation([...historyWithUser, { role: 'assistant', content: reply }]);
        setHankMessages((prev) => [...prev, { type: 'bot', text: reply }]);
      } catch {
        setHankMessages((prev) => [
          ...prev,
          { type: 'bot', text: 'Something went wrong — try again in a moment.' },
        ]);
      } finally {
        setHankLoading(false);
      }
    },
    [hankConversation, hankInput, hankLoading, hankSystemPrompt],
  );

  const toggleFeature = (f: string) =>
    setFeatureFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  const toggleShortlist = (name: string, cat: SolutionCategoryId) => {
    const key = `${cat}|${name}`;
    setShortlist((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, { name, category: cat });
      return next;
    });
  };

  const recommendFromShortlist = () => {
    const names = [...shortlist.values()].map((s) => s.name);
    const seed = names.length
      ? `I've shortlisted these options: ${names.join(', ')}. Based on these, which is the best fit for my business and why? Ask me anything you need to narrow it down.`
      : `Help me figure out which solution is the best fit for my business — ask me a few questions to narrow it down.`;
    void sendHank(seed);
  };

  const toggleIntent = (id: string) =>
    setSubmitIntents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submitShortlist = async () => {
    setSubmitting(true);
    const names = [...shortlist.values()].map((s) => s.name);
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

  return (
    <div className="fs-page">
      <section className="fs-page-hank">
        <div className="fs-page-hank-intro">
          <div className="fs-page-hank-title">
            <AppIcon name="hank" size={18} /> Ask Hank for recommendations
          </div>
          <p className="fs-page-hank-sub">
            Describe what you need and Hank will suggest options — or browse and filter below on your own.
          </p>
        </div>
        <div className="fs-hank-messages fs-page-hank-messages" ref={hankListRef}>
          {hankMessages.length === 0 && (
            <p className="fs-hank-empty">
              Example: &ldquo;We need UCaaS for 50 users with Microsoft Teams and a contact center.&rdquo;
            </p>
          )}
          {hankMessages.map((m, i) => (
            <div key={i} className={`fs-hank-msg fs-hank-msg--${m.type}`}>
              <div dangerouslySetInnerHTML={{ __html: m.text }} />
            </div>
          ))}
          {hankLoading && (
            <div className="fs-hank-msg fs-hank-msg--bot">
              <div className="typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
        </div>
        <div className="fs-hank-input-row">
          <input
            className="fs-hank-input"
            placeholder="Tell Hank about your requirements, team size, must-haves…"
            value={hankInput}
            onChange={(e) => setHankInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void sendHank()}
            disabled={hankLoading}
          />
          <button
            type="button"
            className="fs-hank-send"
            disabled={hankLoading || !hankInput.trim()}
            onClick={() => void sendHank()}
          >
            Send
          </button>
        </div>
      </section>

      <div className="fs-page-layout">
        <aside className="fs-page-sidebar">
          <div className="fs-page-sidebar-title">Portfolio</div>

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

          <label className="fs-page-filter-label">
            Categories
            <select
              className="fs-page-select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as SolutionCategoryId | 'all')}
            >
              <option value="all">All suppliers</option>
              {SOLUTION_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

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

          {(query ||
            categoryFilter !== 'all' ||
            featureFilters.size > 0 ||
            networkOnly ||
            recommendedOnly) && (
            <button type="button" className="fs-page-clear" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </aside>

        <main className="fs-page-main">
          <div className="fs-page-toolbar">
            <input
              className="fs-page-search"
              placeholder="Find"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="fs-page-tabs">
              {VIEW_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`fs-page-tab${viewMode === tab.id ? ' active' : ''}`}
                  onClick={() => setViewMode(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="fs-page-count">
            {filtered.length} supplier{filtered.length === 1 ? '' : 's'}
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
                    const key = `${cat}|${s.name}`;
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
                                className={`fs-interest-btn${shortlist.has(key) ? ' active' : ''}`}
                                onClick={() => toggleShortlist(s.name, cat)}
                                aria-label={shortlist.has(key) ? 'Remove from shortlist' : 'Shortlist'}
                                title={shortlist.has(key) ? 'Shortlisted' : 'Interested'}
                              >
                                {shortlist.has(key) ? '★' : '☆'}
                              </button>
                              <button
                                type="button"
                                className="fs-quote-btn fs-page-matrix-quote"
                                onClick={() => onRequestQuote(cat, s.name)}
                              >
                                Quote
                              </button>
                            </div>
                            <SupplierLogo
                              vendor={s.name}
                              website={s.website}
                              logoUrl={s.logoUrl}
                              size={28}
                              variant="row"
                            />
                            <span className="fs-page-matrix-name-text">{s.name}</span>
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
              {filtered.map((s) => {
                const cat = primaryCategory(s);
                const key = `${cat}|${s.name}`;
                return (
                  <SupplierCard
                    key={`${s.name}-${s.source}`}
                    supplier={s}
                    categoryFilter={categoryFilter}
                    shortlisted={shortlist.has(key)}
                    onToggleShortlist={() => toggleShortlist(s.name, cat)}
                    onRequestQuote={() => onRequestQuote(cat, s.name)}
                  />
                );
              })}
            </div>
          )}

          {filtered.length === 0 && (
            <div className="fs-page-empty">
              No suppliers match your filters. Try clearing filters or ask Hank for help.
            </div>
          )}
        </main>
      </div>

      {shortlist.size > 0 && !submitted && (
        <div className="fs-shortlist-bar fs-page-shortlist">
          <div className="fs-shortlist-info">
            <strong>{shortlist.size} shortlisted</strong>
            <span className="fs-shortlist-names">{[...shortlist.values()].map((s) => s.name).join(', ')}</span>
          </div>
          <div className="fs-shortlist-actions">
            <button type="button" className="fs-ask-btn" onClick={recommendFromShortlist}>
              <AppIcon name="hank" size={13} /> Recommend for me
            </button>
            {onBuildQuoteFromShortlist ? (
              <button
                type="button"
                className="fs-quote-btn"
                onClick={() => {
                  const names = [...shortlist.values()].map((s) => s.name);
                  const cat = [...shortlist.values()][0]?.category;
                  onBuildQuoteFromShortlist(names, cat);
                }}
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

      {submitOpen && shortlist.size > 0 && !submitted && (
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
    </div>
  );
}
