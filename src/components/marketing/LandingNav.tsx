'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CandidLogo } from '@/components/CandidLogo';
import { buildSignupHref } from '@/lib/marketing/signup';

type LandingNavProps = {
  active?: 'home' | 'partners' | 'marketplace' | 'pricing';
};

export function LandingNav({ active = 'home' }: LandingNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className={`mkt-nav${open ? ' open' : ''}`}>
      <div className="mkt-wrap mkt-nav-inner">
        <Link href="/welcome" aria-label="Candid IQ home" className="mkt-nav-logo">
          <CandidLogo size="prospect" lockup />
        </Link>

        <nav className="mkt-nav-links" aria-label="Marketing">
          <a href={active === 'home' ? '#product' : '/welcome#product'}>Product</a>
          <Link href="/welcome/marketplace" aria-current={active === 'marketplace' ? 'page' : undefined}>
            Marketplace
          </Link>
          <a href={active === 'home' ? '#how' : '/welcome#how'}>How it works</a>
          <a href={active === 'home' ? '#pricing' : '/welcome#pricing'}>Pricing</a>
          <Link href="/welcome/partners" aria-current={active === 'partners' ? 'page' : undefined}>
            Partners
          </Link>
          <a href="https://candid.solutions" target="_blank" rel="noreferrer">
            Candid Solutions
          </a>
        </nav>

        <div className="mkt-nav-actions">
          <Link href="/" className="mkt-btn mkt-btn--ghost">
            Sign in
          </Link>
          <Link href={buildSignupHref({ intent: 'analysis' })} className="mkt-btn mkt-btn--primary">
            Get started
          </Link>
          <button
            type="button"
            className="mkt-nav-toggle"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            ☰
          </button>
        </div>
      </div>
    </header>
  );
}
