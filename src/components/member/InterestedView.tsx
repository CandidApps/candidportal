'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { SupplierLogo } from '@/components/SupplierLogo';
import { SupplierDetailModal } from '@/components/member/SupplierDetailModal';
import { removeInterested, toggleInterested, useInterested } from '@/lib/member-interested-client';
import { openSupplierReferral } from '@/lib/member-referral-client';
import { solutionCategoryLabel, type CatalogSupplier, type SolutionCategoryId } from '@/lib/solutions/catalog';
import { supplierEarningsBadge } from '@/lib/solutions/supplier-earnings';
import {
  buildMergedSuppliers,
  primaryCategory,
  type MergedSolutionSupplier,
} from '@/lib/solutions/supplier-matrix';

type Row = {
  name: string;
  category: string | null;
  supplier: MergedSolutionSupplier | null;
};

/** Top-bar cart icon with the interested count. */
export function InterestedCartButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  const { items } = useInterested();
  const count = items.length;
  return (
    <button
      type="button"
      className={`topbar-cart${active ? ' is-active' : ''}`}
      onClick={onClick}
      aria-label={`Interested suppliers${count ? ` (${count})` : ''}`}
      title="Interested suppliers"
    >
      <AppIcon name="cart" size={16} />
      {count > 0 && <span className="topbar-cart-count">{count > 99 ? '99+' : count}</span>}
    </button>
  );
}

export default function InterestedView({
  onRequestQuotes,
  onFindSolutions,
}: {
  onRequestQuotes: (vendorNames: string[], categoryId?: SolutionCategoryId) => void;
  onFindSolutions: () => void;
}) {
  const interested = useInterested();
  const [catalog, setCatalog] = useState<CatalogSupplier[]>([]);
  const [detailName, setDetailName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/portal/solutions')
      .then((r) => (r.ok ? r.json() : { suppliers: [] }))
      .then((j: { suppliers?: CatalogSupplier[] }) => {
        if (!cancelled) setCatalog(j.suppliers ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const merged = useMemo(() => buildMergedSuppliers(catalog), [catalog]);

  const rows: Row[] = useMemo(
    () =>
      interested.items.map((item) => ({
        name: item.name,
        category: item.category ?? null,
        supplier: merged.find((s) => s.name.toLowerCase() === item.name.toLowerCase()) ?? null,
      })),
    [interested.items, merged],
  );

  const quotable = rows.filter((r) => r.supplier?.buyMode !== 'referral');
  const quoteCategories = [...new Set(quotable.map((r) => r.category).filter(Boolean))] as SolutionCategoryId[];

  const detailSupplier = detailName ? merged.find((s) => s.name === detailName) ?? null : null;

  return (
    <>
      <div className="greeting">
        <h2>
          Your <span style={{ color: 'var(--red)' }}>interested</span> list
        </h2>
        <p>Suppliers you&apos;ve saved from Find Solutions. Request quotes together or order direct.</p>
      </div>

      {interested.loaded && rows.length === 0 ? (
        <div className="interested-empty">
          <AppIcon name="cart" size={28} />
          <p>You haven&apos;t saved any suppliers yet.</p>
          <button type="button" className="btn-primary" onClick={onFindSolutions}>
            Browse Find Solutions
          </button>
        </div>
      ) : (
        <>
          <ul className="interested-list">
            {rows.map((r) => {
              const s = r.supplier;
              const badge = s ? supplierEarningsBadge(s) : null;
              const isReferral = s?.buyMode === 'referral';
              return (
                <li key={r.name} className="interested-row">
                  <SupplierLogo vendor={r.name} website={s?.website} logoUrl={s?.logoUrl} size={40} />
                  <div className="interested-text">
                    <strong>{r.name}</strong>
                    <span className="interested-meta">
                      {r.category ? solutionCategoryLabel(r.category as SolutionCategoryId) : 'Supplier'}
                      {isReferral ? ' · Direct from supplier' : ''}
                    </span>
                  </div>
                  {badge && <span className="fs-badge fs-badge--cashback">{badge}</span>}
                  <div className="interested-actions">
                    {s && (
                      <button type="button" className="fs-card-btn" onClick={() => setDetailName(s.name)}>
                        View details
                      </button>
                    )}
                    {isReferral && (
                      <button
                        type="button"
                        className="fs-card-btn fs-card-btn--primary"
                        onClick={() => openSupplierReferral(s?.providerId)}
                      >
                        Order here <AppIcon name="external" size={11} />
                      </button>
                    )}
                    <button type="button" className="interested-remove" onClick={() => void removeInterested(r.name)}>
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {quotable.length > 0 && (
            <div className="interested-footer">
              <span>
                {quotable.length} supplier{quotable.length === 1 ? '' : 's'} ready for a quote
              </span>
              <button
                type="button"
                className="btn-primary"
                onClick={() =>
                  onRequestQuotes(
                    quotable.map((r) => r.name),
                    quoteCategories.length === 1 ? quoteCategories[0] : undefined,
                  )
                }
              >
                Request quotes for all →
              </button>
            </div>
          )}
        </>
      )}

      {detailSupplier && (
        <SupplierDetailModal
          supplier={detailSupplier}
          matrixCard={detailSupplier.ucaas ?? detailSupplier.ccaas}
          cashBackBadge={supplierEarningsBadge(detailSupplier)}
          interested={interested.has(detailSupplier.name)}
          onToggleInterested={() =>
            void toggleInterested({
              name: detailSupplier.name,
              category: primaryCategory(detailSupplier),
              providerId: detailSupplier.providerId,
            })
          }
          primaryAction={
            detailSupplier.buyMode === 'referral'
              ? { label: 'Order here', onClick: () => openSupplierReferral(detailSupplier.providerId) }
              : {
                  label: 'Get a quote →',
                  onClick: () => {
                    setDetailName(null);
                    onRequestQuotes([detailSupplier.name], primaryCategory(detailSupplier));
                  },
                }
          }
          onClose={() => setDetailName(null)}
        />
      )}
    </>
  );
}
