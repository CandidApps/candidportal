'use client';

import Link from 'next/link';
import {
  type MarketplaceVendor,
  vendorFavicon,
  vendorInitials,
} from '@/lib/marketing/marketplace-data';
import { buildSignupHref } from '@/lib/marketing/signup';
import { solutionCategoryLabel } from '@/lib/solutions/catalog';

function VendorLogo({ name, domain }: { name: string; domain: string }) {
  return (
    <span className="mkt-vendor-logo mkt-vendor-logo--lg">
      <img
        src={vendorFavicon(domain)}
        alt=""
        width={40}
        height={40}
        loading="lazy"
        decoding="async"
        onError={(e) => {
          const img = e.currentTarget;
          img.style.display = 'none';
          const fallback = img.nextElementSibling as HTMLElement | null;
          if (fallback) fallback.hidden = false;
        }}
      />
      <span className="mkt-vendor-logo-fallback" hidden>
        {vendorInitials(name)}
      </span>
    </span>
  );
}

export function MarketplaceVendorGrid({
  vendors,
  variant,
}: {
  vendors: MarketplaceVendor[];
  variant: 'bestseller' | 'savings';
}) {
  return (
    <div className={`mkt-vendor-grid mkt-vendor-grid--${variant}`}>
      {vendors.map((v) => (
        <article key={v.name} className="mkt-vendor-card">
          <div className="mkt-vendor-card-top">
            <VendorLogo name={v.name} domain={v.domain} />
            <div>
              <h3>{v.name}</h3>
              <span className="mkt-vendor-meta">
                {v.negotiations.toLocaleString()} negotiations · {solutionCategoryLabel(v.category)}
              </span>
            </div>
          </div>
          <p>{v.blurb}</p>
          <div className="mkt-vendor-card-foot">
            {variant === 'savings' ? (
              <span className="mkt-vendor-save-badge">Save up to {v.saveUpTo}%</span>
            ) : v.recentSave ? (
              <span className="mkt-vendor-recent">
                Recent save: <strong>${v.recentSave.amount.toLocaleString()}</strong> ({v.recentSave.pct}%)
              </span>
            ) : (
              <span className="mkt-vendor-save-badge">Save up to {v.saveUpTo}%</span>
            )}
            <Link
              href={buildSignupHref({
                intent: 'quote',
                category: v.category,
                vendor: v.name,
              })}
              className="mkt-vendor-link"
            >
              Get quote →
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
