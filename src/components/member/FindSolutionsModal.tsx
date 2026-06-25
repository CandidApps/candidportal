'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import {
  CATALOG_SUPPLIERS,
  SOLUTION_CATEGORIES,
  solutionCategoryLabel,
  suppliersForCategory,
  type CatalogSupplier,
  type SolutionCategoryId,
} from '@/lib/solutions/catalog';

export default function FindSolutionsModal({
  onClose,
  onRequestQuote,
  onAskHank,
}: {
  onClose: () => void;
  onRequestQuote: (category: SolutionCategoryId, supplier?: string) => void;
  onAskHank?: (text: string) => void;
}) {
  const [systemSuppliers, setSystemSuppliers] = useState<CatalogSupplier[]>([]);
  const [category, setCategory] = useState<SolutionCategoryId | null>(null);

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

  const countByCategory = useMemo(() => {
    const map = new Map<SolutionCategoryId, number>();
    for (const cat of SOLUTION_CATEGORIES) {
      map.set(cat.id, suppliersForCategory(cat.id, systemSuppliers).length);
    }
    return map;
  }, [systemSuppliers]);

  const suppliers = category ? suppliersForCategory(category, systemSuppliers) : [];

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box fs-modal" role="dialog" aria-label="Find solutions">
        <div className="modal-header">
          <div className="modal-header-left">
            <div className="fs-head-icon">
              <AppIcon name="sparkles" size={18} />
            </div>
            <div>
              <div className="modal-title">
                {category ? solutionCategoryLabel(category) : 'Find Solutions'}
              </div>
              <div className="modal-subtitle">
                {category
                  ? 'Compare suppliers Candid can set up for you'
                  : 'What are you looking for? Pick a category to compare options.'}
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="fs-body">
          {!category && (
            <div className="fs-cat-grid">
              {SOLUTION_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="fs-cat-btn"
                  onClick={() => setCategory(c.id)}
                >
                  <span className="fs-cat-icon">
                    <AppIcon name={c.icon} size={20} />
                  </span>
                  <span className="fs-cat-label">{c.label}</span>
                  <span className="fs-cat-blurb">{c.blurb}</span>
                  <span className="fs-cat-count">{countByCategory.get(c.id) ?? 0} options</span>
                </button>
              ))}
            </div>
          )}

          {category && (
            <>
              <button type="button" className="fs-back" onClick={() => setCategory(null)}>
                <AppIcon name="panelCollapse" size={12} /> All categories
              </button>

              <div className="fs-supplier-grid">
                {suppliers.map((s) => (
                  <div key={`${s.name}-${s.source}`} className="fs-supplier">
                    <div className="fs-supplier-head">
                      <div className="fs-supplier-name">{s.name}</div>
                      <span className={`fs-badge fs-badge--${s.source}`}>
                        {s.source === 'candid' ? 'In Candid network' : 'Available via Candid'}
                      </span>
                    </div>
                    <ul className="fs-feature-list">
                      {s.features.map((f, i) => (
                        <li key={i}>
                          <AppIcon name="check" size={11} /> {f}
                        </li>
                      ))}
                    </ul>
                    <div className="fs-supplier-foot">
                      <span className="fs-price">{s.pricing ?? 'Custom pricing — we negotiate it'}</span>
                      <div className="fs-supplier-actions">
                        {s.website && (
                          <a
                            className="fs-link-btn"
                            href={s.website}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <AppIcon name="link" size={11} /> Site
                          </a>
                        )}
                        <button
                          type="button"
                          className="fs-quote-btn"
                          onClick={() => onRequestQuote(category, s.name)}
                        >
                          Get a quote →
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="fs-footer-cta">
                <div>
                  <div className="fs-footer-title">Not sure which is right?</div>
                  <div className="fs-footer-sub">
                    Tell Hank what you need and we&apos;ll shortlist the best fit and pricing.
                  </div>
                </div>
                <button
                  type="button"
                  className="fs-ask-btn"
                  onClick={() => {
                    onAskHank?.(
                      `I'm looking for ${solutionCategoryLabel(category)} options. What do you recommend for my business?`,
                    );
                    onClose();
                  }}
                >
                  <AppIcon name="hank" size={13} /> Ask Hank
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export { CATALOG_SUPPLIERS };
