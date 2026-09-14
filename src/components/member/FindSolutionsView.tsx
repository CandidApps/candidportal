'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { SupplierLogo } from '@/components/SupplierLogo';
import { callHankAPI, HANK_CORE_PROMPT } from '@/lib/candid-data';
import {
  formatMemberEarningsBadge,
  formatMemberEarningsSentence,
} from '@/lib/member-earnings-profile';
import { memberPromoBadge, formatPromoExpiry, type MemberPromo } from '@/lib/member-promos';
import { formatHankChatHtml } from '@/lib/rich-text';
import {
  solutionCategoryLabel,
  type CatalogSupplier,
  type SolutionCategoryId,
} from '@/lib/solutions/catalog';
import {
  buildMergedSuppliers,
  filterSuppliers,
  mustHaveOptionsForCategory,
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
type SearchMode = 'catalog' | 'guided';

const GUIDED_GREETING =
  'I’ll help you narrow this down. Tap a category — including All solutions — or tell me what you need in your own words. I’ll ask a couple of follow-ups, then point you to a short list.';

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

function CategoryTiles({
  value,
  onSelect,
}: {
  value: SolutionCategoryId | 'all';
  onSelect: (id: SolutionCategoryId | 'all') => void;
}) {
  return (
    <div className="fs-cat-grid" role="listbox" aria-label="Solution categories">
      <button
        type="button"
        role="option"
        aria-selected={value === 'all'}
        className={`fs-cat-tile${value === 'all' ? ' is-on' : ''}`}
        onClick={() => onSelect('all')}
        title="Show every supplier in the catalog"
      >
        <span className="fs-cat-tile-icon" aria-hidden>
          <AppIcon name="dashboard" size={20} />
        </span>
        <span className="fs-cat-tile-label">All solutions</span>
      </button>
      {SOLUTION_CATEGORIES.map((c) => (
        <button
          key={c.id}
          type="button"
          role="option"
          aria-selected={value === c.id}
          className={`fs-cat-tile${value === c.id ? ' is-on' : ''}`}
          onClick={() => onSelect(c.id)}
          title={c.blurb}
        >
          <span className="fs-cat-tile-icon" aria-hidden>
            <AppIcon name={c.icon} size={20} />
          </span>
          <span className="fs-cat-tile-label">{c.label}</span>
        </button>
      ))}
    </div>
  );
}

function supplierEarningsCopy(supplier: MergedSolutionSupplier): string | null {
  if (supplier.earningsCopy?.trim()) return supplier.earningsCopy.trim();
  return formatMemberEarningsSentence(supplier.earningsProfile);
}

function supplierEarningsBadge(supplier: MergedSolutionSupplier): string | null {
  const fromProfile = formatMemberEarningsBadge(supplier.earningsProfile);
  if (fromProfile) return fromProfile;
  if (supplier.cashbackPct == null || !Number.isFinite(supplier.cashbackPct) || supplier.cashbackPct <= 0) {
    return null;
  }
  const rounded = Math.round(supplier.cashbackPct * 10) / 10;
  return `${rounded}% cash back`;
}

function supplierPromos(supplier: MergedSolutionSupplier): MemberPromo[] {
  return supplier.promos ?? [];
}

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
          <div className="fs-supplier-name-row">
            <div className="fs-supplier-name">{supplier.name}</div>
            {supplierEarningsBadge(supplier) && (
              <span className="fs-badge fs-badge--cashback" title="Customer earnings">
                {supplierEarningsBadge(supplier)}
              </span>
            )}
            {memberPromoBadge(supplierPromos(supplier)) && (
              <span className="fs-badge fs-badge--promo" title="Supplier promo">
                {memberPromoBadge(supplierPromos(supplier))}
              </span>
            )}
          </div>
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

      {supplierEarningsCopy(supplier) && (
        <p className="fs-cashback-note">{supplierEarningsCopy(supplier)}</p>
      )}

      {supplierPromos(supplier).length > 0 && (
        <div className="fs-promo-notes">
          {supplierPromos(supplier).map((promo) => (
            <p key={promo.id} className="fs-promo-note">
              <strong>{promo.title}</strong>
              {promo.details ? ` — ${promo.details}` : ''}
              {promo.expiresOn ? ` (through ${formatPromoExpiry(promo.expiresOn)})` : ''}
            </p>
          ))}
        </div>
      )}

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
  const [searchMode, setSearchMode] = useState<SearchMode>('catalog');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<FindSolutionsSort>('cashback-desc');
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
  const hankLoadingRef = useRef(false);

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

  const mustHaveOptions = useMemo(
    () => mustHaveOptionsForCategory(mergedSuppliers, categoryFilter),
    [mergedSuppliers, categoryFilter],
  );

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

  const filtersActive =
    query.trim().length > 0 ||
    categoryFilter !== 'all' ||
    featureFilters.size > 0 ||
    networkOnly ||
    recommendedOnly;

  const hankSystemPrompt = useMemo(() => {
    const names = filtered.slice(0, 15).map((s) => s.name).join(', ');
    const filters = [
      categoryFilter !== 'all' ? solutionCategoryLabel(categoryFilter) : 'All solutions',
      featureFilters.size ? [...featureFilters].join(', ') : null,
      networkOnly ? 'Candid network only' : null,
      recommendedOnly ? 'Candid recommended only' : null,
      query.trim() || null,
    ]
      .filter(Boolean)
      .join('; ');
    return `${HANK_CORE_PROMPT}

CONTEXT: The customer is on the Find Solutions page in the member portal, using guided search. They can tap category and must-have chips as well as type freely. After each pick, ask 1–2 short follow-up questions (team size, locations, must-haves, timeline) before recommending. Keep answers concise. Name specific suppliers from the visible list. Quote requests go through Candid — not direct to suppliers. Never mention commission; talk about discount, rebate, or cash back.
Active filters: ${filters}.
${names ? `Visible suppliers (${filtered.length} total, showing names): ${names}.` : 'No suppliers match the current filters.'}`;
  }, [filtered, categoryFilter, featureFilters, networkOnly, recommendedOnly, query]);

  const sendHank = useCallback(
    async (text?: string, apiText?: string) => {
      const display = (text ?? hankInput).trim();
      if (!display || hankLoadingRef.current) return;
      const forApi = (apiText ?? display).trim();
      hankLoadingRef.current = true;
      setHankInput('');
      setHankLoading(true);
      setHankMessages((prev) => [...prev, { type: 'user', text: display }]);
      const historyWithUser = [...hankConversation, { role: 'user', content: forApi }];
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
        hankLoadingRef.current = false;
        setHankLoading(false);
      }
    },
    [hankConversation, hankInput, hankSystemPrompt],
  );

  const enterGuidedMode = useCallback(() => {
    setSearchMode('guided');
    setHankMessages((prev) => (prev.length > 0 ? prev : [{ type: 'bot', text: GUIDED_GREETING }]));
  }, []);

  const setBrowseCategory = (id: SolutionCategoryId | 'all') => {
    setCategoryFilter(id);
    setFeatureFilters(new Set());
  };

  const pickGuidedCategory = (id: SolutionCategoryId | 'all') => {
    const next = id !== 'all' && categoryFilter === id ? 'all' : id;
    if (next === categoryFilter && id === 'all') return;
    setCategoryFilter(next);
    setFeatureFilters(new Set());
    if (next === 'all') {
      void sendHank(
        'Show me all solutions again.',
        `I want to see all solutions again — don't limit me to one category. Ask me what I'm shopping for so we can narrow this down.`,
      );
    } else {
      const label = solutionCategoryLabel(next);
      void sendHank(
        `I'm shopping for ${label}.`,
        `I'm shopping for ${label}. Ask me 2–3 short follow-up questions (team size, locations, must-haves, timeline) so we can narrow the supplier list. Then name a few good matches from the current results.`,
      );
    }
  };

  const toggleFeature = (f: string) =>
    setFeatureFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  const toggleGuidedFeature = (f: string) => {
    const adding = !featureFilters.has(f);
    toggleFeature(f);
    void sendHank(
      adding ? `${f} is a must-have.` : `I don't need ${f} as a must-have anymore.`,
      adding
        ? `${f} is a must-have. Confirm you cover that, ask if I need anything else, then suggest matching suppliers from the current list.`
        : `I don't need ${f} as a must-have anymore. Update your recommendation.`,
    );
  };

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
    enterGuidedMode();
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
      <div className="fs-page-modebar">
        <div className="fs-mode-tabs" role="tablist" aria-label="Find Solutions mode">
          <button
            type="button"
            role="tab"
            aria-selected={searchMode === 'catalog'}
            className={`fs-mode-tab${searchMode === 'catalog' ? ' is-on' : ''}`}
            onClick={() => setSearchMode('catalog')}
          >
            <AppIcon name="search" size={13} /> Browse catalog
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={searchMode === 'guided'}
            className={`fs-mode-tab${searchMode === 'guided' ? ' is-on' : ''}`}
            onClick={enterGuidedMode}
          >
            <AppIcon name="hank" size={13} /> Guided search
          </button>
        </div>
        <p className="fs-mode-hint">
          {searchMode === 'catalog'
            ? 'Filter the full catalog from the sidebar — All solutions is always one click away.'
            : 'Tap chips or type. Frank asks follow-ups and the list below updates as you go.'}
        </p>
      </div>

      {searchMode === 'guided' && (
        <section className="fs-page-hank fs-page-guided">
          <div className="fs-page-hank-intro">
            <div className="fs-page-hank-title">
              <AppIcon name="hank" size={18} /> Frank — guided search
            </div>
            <p className="fs-page-hank-sub">
              Tap a category or must-have, or describe what you need. Click a selected category again (or All
              solutions) to undo.
            </p>
            <button type="button" className="fs-guided-switch" onClick={() => setSearchMode('catalog')}>
              Browse with filters instead
            </button>
          </div>
          <div className="fs-hank-messages fs-page-hank-messages" ref={hankListRef}>
            {hankMessages.map((m, i) => (
              <div key={i} className={`fs-hank-msg fs-hank-msg--${m.type}`}>
                {m.type === 'bot' ? (
                  <div dangerouslySetInnerHTML={{ __html: formatHankChatHtml(m.text) }} />
                ) : (
                  <div>{m.text}</div>
                )}
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

          <div className="fs-page-guide">
            <div className="fs-page-guide-step">
              <div className="fs-page-guide-kicker">Step 1 · What are you shopping for?</div>
              <p className="fs-page-guide-sub">
                Pick a category, or All solutions to keep the full catalog. Click the selected category again to
                go back.
              </p>
              <CategoryTiles value={categoryFilter} onSelect={pickGuidedCategory} />
            </div>

            <div className="fs-page-guide-step">
              <div className="fs-page-guide-kicker">
                Step 2 · Any must-haves
                {categoryFilter !== 'all' ? ` for ${solutionCategoryLabel(categoryFilter)}` : ''}?
              </div>
              <p className="fs-page-guide-sub">
                Tap what matters. Frank will ask a couple of follow-ups in the chat.
              </p>
              {mustHaveOptions.length > 0 ? (
                <div className="fs-attr-chip-grid">
                  {mustHaveOptions.map((f) => {
                    const on = featureFilters.has(f);
                    return (
                      <button
                        key={f}
                        type="button"
                        className={`fs-attr-chip${on ? ' is-on' : ''}`}
                        aria-pressed={on}
                        onClick={() => toggleGuidedFeature(f)}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="fs-page-guide-sub" style={{ marginTop: 0 }}>
                  No common must-haves listed yet — tell Frank in the chat, or pick a more specific category.
                </p>
              )}
            </div>

            <div className="fs-page-guide-step">
              <div className="fs-page-guide-kicker">Optional · Narrow the network</div>
              <div className="fs-attr-chip-grid">
                <button
                  type="button"
                  className={`fs-attr-chip${networkOnly ? ' is-on' : ''}`}
                  aria-pressed={networkOnly}
                  onClick={() => setNetworkOnly((v) => !v)}
                >
                  In Candid network
                </button>
                <button
                  type="button"
                  className={`fs-attr-chip${recommendedOnly ? ' is-on' : ''}`}
                  aria-pressed={recommendedOnly}
                  onClick={() => setRecommendedOnly((v) => !v)}
                >
                  Candid recommended
                </button>
              </div>
            </div>
          </div>

          <div className="fs-hank-input-row">
            <input
              className="fs-hank-input"
              placeholder="e.g. 50 users, Microsoft Teams, two offices…"
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
      )}

      <div className="fs-page-layout">
        {searchMode === 'catalog' && (
          <aside className="fs-page-sidebar">
            <div className="fs-page-sidebar-title">Filters</div>

            <button type="button" className="fs-sidebar-guided" onClick={enterGuidedMode}>
              <AppIcon name="hank" size={13} /> Start guided search
            </button>

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

        <main className="fs-page-main">
          <div className="fs-page-results-head">
            <div className="fs-page-toolbar">
              <input
                className="fs-page-search"
                placeholder="Search suppliers…"
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
              {searchMode === 'guided' && (
                <label className="fs-page-sort">
                  <span className="fs-page-sort-label">Sort</span>
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
              )}
            </div>

            <div className="fs-page-results-meta">
              <div className="fs-page-filter-chips">
                {categoryFilter !== 'all' && (
                  <button
                    type="button"
                    className="fs-filter-chip is-on"
                    onClick={() =>
                      searchMode === 'guided' ? pickGuidedCategory(categoryFilter) : setBrowseCategory('all')
                    }
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
                    onClick={() => (searchMode === 'guided' ? toggleGuidedFeature(f) : toggleFeature(f))}
                  >
                    {f} ×
                  </button>
                ))}
                {searchMode === 'guided' && filtersActive && (
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
              No suppliers match your filters. Try clearing filters
              {searchMode === 'catalog' ? ' or start guided search.' : ' or ask Frank for help.'}
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
