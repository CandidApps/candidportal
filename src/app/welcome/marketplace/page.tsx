import type { Metadata } from 'next';
import Link from 'next/link';
import { AppIcon } from '@/components/AppIcon';
import { LandingNav } from '@/components/marketing/LandingNav';
import { LandingFooter } from '@/components/marketing/LandingFooter';
import { SavingsTicker } from '@/components/marketing/SavingsTicker';
import { MarketplaceVendorGrid } from '@/components/marketing/MarketplaceVendorGrid';
import { MarketplaceHeroQuote } from '@/components/marketing/MarketplaceHeroQuote';
import {
  MARKETPLACE_BESTSELLERS,
  MARKETPLACE_TOP_SAVINGS,
  SOLUTION_CATEGORIES,
} from '@/lib/marketing/marketplace-data';
import { buildSignupHref } from '@/lib/marketing/signup';
import '../welcome.css';

export const metadata: Metadata = {
  title: 'Candid IQ Marketplace — Compare & save on business tech',
  description:
    'Browse 300+ technology and utility providers. Benchmark pricing, request quotes, and let Frank and Candid specialists negotiate on your behalf.',
};

export default function MarketplaceLandingPage() {
  return (
    <div className="mkt" data-theme="light">
      <LandingNav active="marketplace" />

      <main>
        <section className="mkt-wrap mkt-market-hero">
          <div className="mkt-market-hero-copy">
            <div className="mkt-kicker">Marketplace</div>
            <h1>
              Buy business tech at a fair price — <em>frankly</em>, the easy way.
            </h1>
            <p>
              Search Candid&apos;s supply chain of 300+ providers. Compare UCaaS, fiber, cyber,
              payments, and utilities — then let Frank benchmark your quote and specialists negotiate
              on your behalf.
            </p>
            <MarketplaceHeroQuote />
            <p className="mkt-market-hero-note">
              Have a bill? We&apos;ll find the savings. Don&apos;t have one? Tell us what you&apos;re
              shopping for and we&apos;ll pull the quotes.
            </p>
          </div>
        </section>

        <SavingsTicker />

        <section className="mkt-section">
          <div className="mkt-wrap">
            <div className="mkt-section-head">
              <div className="mkt-kicker">Bestsellers</div>
              <h2>Most quoted in the Candid network</h2>
              <p>
                The providers businesses quote most across voice, data, cloud, and security — and the
                kind of savings that come out the other side.
              </p>
            </div>
            <MarketplaceVendorGrid vendors={MARKETPLACE_BESTSELLERS} variant="bestseller" />
          </div>
        </section>

        <section className="mkt-section">
          <div className="mkt-wrap">
            <div className="mkt-section-head">
              <div className="mkt-kicker">Top savings</div>
              <h2>Where Frank finds the most leverage</h2>
            </div>
            <MarketplaceVendorGrid vendors={MARKETPLACE_TOP_SAVINGS} variant="savings" />
          </div>
        </section>

        <section className="mkt-section">
          <div className="mkt-wrap">
            <div className="mkt-section-head center">
              <div className="mkt-kicker">Browse categories</div>
              <h2>Same categories as Find Solutions in your portal</h2>
              <p>Pick a category to start a quote request — no bill required.</p>
            </div>
            <div className="mkt-cat-grid">
              {SOLUTION_CATEGORIES.filter((c) => c.id !== 'other').map((cat) => (
                <Link
                  key={cat.id}
                  href={buildSignupHref({ intent: 'quote', category: cat.id })}
                  className="mkt-cat-card"
                >
                  <span className="mkt-cat-icon">
                    <AppIcon name={cat.icon} size={18} />
                  </span>
                  <div>
                    <strong>{cat.label}</strong>
                    <p>{cat.blurb}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="mkt-wrap" id="cta">
          <div className="mkt-cta">
            <div>
              <h2>Found something? Frank will take it from here.</h2>
              <p>
                Request a quote or a free savings analysis — either way, Frank benchmarks it and a
                specialist chases it down. You just approve.
              </p>
            </div>
            <div className="mkt-cta-actions">
              <Link href={buildSignupHref({ intent: 'quote' })} className="mkt-btn mkt-btn--primary mkt-btn--lg">
                Request a quote
              </Link>
              <Link href="/welcome" className="mkt-btn mkt-btn--outline mkt-btn--lg mkt-btn--on-dark">
                Back to Candid IQ
              </Link>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
