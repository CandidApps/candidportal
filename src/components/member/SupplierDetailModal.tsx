'use client';

import { useEffect, useRef } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { SupplierLogo } from '@/components/SupplierLogo';
import { formatMemberEarningsBadge, memberEarningsRows } from '@/lib/member-earnings-profile';
import { formatPromoExpiry } from '@/lib/member-promos';
import { solutionCategoryLabel } from '@/lib/solutions/catalog';
import {
  primaryCategory,
  type MatrixCard,
  type MergedSolutionSupplier,
} from '@/lib/solutions/supplier-matrix';

function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
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

/** Member "View details" popup: supplier info, solutions & features, cash-back structure and live promos. */
export function SupplierDetailModal({
  supplier,
  matrixCard,
  cashBackBadge,
  highlightPromoId,
  interested,
  onToggleInterested,
  primaryAction,
  onClose,
}: {
  supplier: MergedSolutionSupplier;
  matrixCard?: MatrixCard;
  cashBackBadge: string | null;
  highlightPromoId?: string | null;
  interested: boolean;
  onToggleInterested: () => void;
  primaryAction: { label: string; onClick: () => void };
  onClose: () => void;
}) {
  const highlightRef = useRef<HTMLDivElement>(null);
  const rows = memberEarningsRows(supplier.earningsProfile);
  const promos = supplier.promos ?? [];
  const services = supplier.services?.length ? supplier.services : supplier.matrixFeatures;
  const features = supplier.features.filter((f) => !services.includes(f));
  const isReferral = supplier.buyMode === 'referral';

  useEffect(() => {
    highlightRef.current?.scrollIntoView({ block: 'nearest' });
  }, [highlightPromoId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-box fs-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${supplier.name} details`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-header-left">
            <span className="fs-detail-logo">
              <SupplierLogo
                vendor={supplier.name}
                website={supplier.website}
                logoUrl={supplier.logoUrl}
                size={36}
                variant="card"
              />
            </span>
            <div>
              <div className="modal-title">{supplier.name}</div>
              <div className="modal-subtitle">{solutionCategoryLabel(primaryCategory(supplier))}</div>
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-body fs-detail-body">
          <div className="fs-page-supplier-badges">
            {cashBackBadge && <span className="fs-badge fs-badge--cashback">{cashBackBadge}</span>}
            {supplier.candidRecommended && (
              <span className="fs-badge fs-badge--recommended">Candid recommended</span>
            )}
            <span className={`fs-badge fs-badge--${isReferral ? 'direct' : supplier.source}`}>
              {isReferral
                ? 'Direct from supplier'
                : supplier.source === 'candid'
                  ? 'In Candid network'
                  : 'Available via Candid'}
            </span>
          </div>
          {supplier.description && <p className="fs-detail-desc">{supplier.description}</p>}

          <div className="fs-detail-grid">
            <section className="fs-detail-section">
              <h4>Supplier details</h4>
              <dl className="fs-detail-facts">
                <div>
                  <dt>Category</dt>
                  <dd>{supplier.categories.map((c) => solutionCategoryLabel(c)).join(', ')}</dd>
                </div>
                {supplier.website && (
                  <div>
                    <dt>Website</dt>
                    <dd>
                      <a href={supplier.website} target="_blank" rel="noreferrer">
                        {displayHost(supplier.website)} <AppIcon name="external" size={11} />
                      </a>
                    </dd>
                  </div>
                )}
                <div>
                  <dt>How you buy</dt>
                  <dd>{isReferral ? 'Order directly from the supplier' : 'Candid quotes and negotiates for you'}</dd>
                </div>
                {!isReferral && (
                  <div>
                    <dt>Pricing</dt>
                    <dd>{supplier.pricing ?? 'Custom pricing — we negotiate it'}</dd>
                  </div>
                )}
              </dl>
            </section>

            <section className="fs-detail-section">
              <h4>Cash back structure</h4>
              {rows.length > 0 ? (
                <table className="fs-detail-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.label}</td>
                        <td className="fs-detail-amount">{r.amount}</td>
                        <td>{r.when}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="fs-detail-empty">
                  {formatMemberEarningsBadge(supplier.earningsProfile) ?? 'No cash back on this supplier yet.'}
                </p>
              )}
            </section>
          </div>

          {promos.length > 0 && (
            <section className="fs-detail-section">
              <h4>Limited-time offers</h4>
              <div className="fs-detail-promos">
                {promos.map((p) => {
                  const on = p.id === highlightPromoId;
                  return (
                    <div
                      key={p.id}
                      ref={on ? highlightRef : undefined}
                      className={`fs-detail-promo${on ? ' is-highlight' : ''}`}
                    >
                      <AppIcon name="gift" size={16} />
                      <div>
                        <strong>{p.title}</strong>
                        {p.details && <p>{p.details}</p>}
                      </div>
                      {p.expiresOn && <span className="fs-detail-promo-ends">Ends {formatPromoExpiry(p.expiresOn)}</span>}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {(services.length > 0 || features.length > 0 || matrixCard) && (
            <section className="fs-detail-section">
              <h4>Solutions &amp; features</h4>
              {services.length > 0 && (
                <div className="fs-page-product-chips">
                  {services.map((s) => (
                    <span key={s} className="fs-page-tag fs-page-tag--product">
                      {s}
                    </span>
                  ))}
                </div>
              )}
              {features.length > 0 && (
                <ul className="fs-feature-list">
                  {features.map((f) => (
                    <li key={f}>
                      <AppIcon name="check" size={11} /> {f}
                    </li>
                  ))}
                </ul>
              )}
              {matrixCard && <MatrixMeta card={matrixCard} />}
            </section>
          )}
        </div>

        <div className="fs-detail-footer">
          <button
            type="button"
            className={`fs-interest-btn fs-detail-interest${interested ? ' active' : ''}`}
            onClick={onToggleInterested}
            aria-pressed={interested}
          >
            {interested ? '✓ Interested' : '+ Interested'}
          </button>
          <button type="button" className="fs-quote-btn fs-detail-primary" onClick={primaryAction.onClick}>
            {primaryAction.label}
          </button>
        </div>
      </div>
    </div>
  );
}
