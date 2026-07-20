'use client';

import Link from 'next/link';
import {
  MARKETPLACE_BESTSELLERS,
  vendorFavicon,
  vendorInitials,
} from '@/lib/marketing/marketplace-data';

function VendorLogo({ name, domain }: { name: string; domain: string }) {
  return (
    <span className="mkt-vendor-logo">
      <img
        src={vendorFavicon(domain)}
        alt=""
        width={32}
        height={32}
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

export function MarketplaceShowcase() {
  return (
    <div className="mkt-marketplace-showcase">
      <div className="mkt-frame mkt-frame--market" aria-hidden>
        <div className="mkt-frame-bar">
          <span className="mkt-dot" />
          <span className="mkt-dot" />
          <span className="mkt-dot" />
          <span className="mkt-frame-title">Marketplace · Find Solutions</span>
        </div>
        <div className="mkt-frame-body mkt-frame-body--market">
          <div className="mkt-mock-main">
            <div className="mkt-market-search">
              <span className="mkt-market-search-icon">⌕</span>
              Search 300+ providers — UCaaS, fiber, cyber, payments…
            </div>
            <div className="mkt-market-list">
              {MARKETPLACE_BESTSELLERS.slice(0, 5).map((v) => (
                <div key={v.name} className="mkt-market-row">
                  <VendorLogo name={v.name} domain={v.domain} />
                  <div className="mkt-market-row-main">
                    <div className="mkt-market-row-top">
                      <strong>{v.name}</strong>
                      <span className="mkt-market-nego">{v.negotiations.toLocaleString()} quotes</span>
                    </div>
                    <p>{v.blurb.slice(0, 72)}…</p>
                  </div>
                  <div className="mkt-market-row-save">
                    {v.recentSave ? (
                      <>
                        <span className="mkt-market-save-amt">
                          ${Math.round(v.recentSave.amount / 1000)}k
                        </span>
                        <span className="mkt-pill mkt-pill--save">−{v.recentSave.pct}%</span>
                      </>
                    ) : (
                      <span className="mkt-pill">Save up to {v.saveUpTo}%</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Link href="/welcome/marketplace" className="mkt-market-browse">
              Browse full marketplace →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
