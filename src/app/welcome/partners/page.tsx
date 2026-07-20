import type { Metadata } from 'next';
import Link from 'next/link';
import { LandingNav } from '@/components/marketing/LandingNav';
import { LandingFooter } from '@/components/marketing/LandingFooter';
import { PartnerPortalMock } from '@/components/marketing/AppMockups';
import '../welcome.css';

export const metadata: Metadata = {
  title: 'Candid IQ for Partners — White-label tech & utilities platform',
  description:
    'White-label Candid IQ for IT companies, MSPs, accountants, and advisors. Quoting, invoicing, contracts, helpdesk, CRM, and Frank AI — under your brand.',
};

export default function PartnersLandingPage() {
  return (
    <div className="mkt" data-theme="light">
      <LandingNav active="partners" />

      <main>
        <section className="mkt-wrap mkt-partner-hero">
          <div className="mkt-eyebrow" style={{ justifyContent: 'center' }}>
            <span className="mkt-eyebrow-dot" />
            Partner platform
          </div>
          <h1>Your clients shouldn&apos;t know it&apos;s ours.</h1>
          <p>
            White-label Candid IQ and deliver a full-service technology, utilities, and spend platform —
            quoting, contracts, invoicing, helpdesk, CRM, and Frank — under your brand. Built for IT
            companies, MSPs, accountants, wealth advisors, and channel agents who want to sell the
            whole platform without building any of it.
          </p>
          <div className="mkt-hero-cta" style={{ justifyContent: 'center' }}>
            <a
              href="https://candid.solutions/contact-us/"
              target="_blank"
              rel="noreferrer"
              className="mkt-btn mkt-btn--primary mkt-btn--lg"
            >
              Become a partner
            </a>
            <Link href="/welcome#pricing" className="mkt-btn mkt-btn--outline mkt-btn--lg">
              See bandwidth pricing
            </Link>
          </div>
        </section>

        <section className="mkt-wrap">
          <PartnerPortalMock />
        </section>

        <section className="mkt-section">
          <div className="mkt-wrap">
            <div className="mkt-section-head center">
              <div className="mkt-kicker">Why partners choose Candid IQ</div>
              <h2>Run the book. We run the marketplace.</h2>
              <p>
                You own the relationship. Candid supplies the supply chain, fulfillment muscle, and AI
                workforce. Your portal looks like you — and works like a modern ops platform.
              </p>
            </div>
            <div className="mkt-wl-grid">
              <article className="mkt-wl-card">
                <h3>White-label client portal</h3>
                <p>
                  Logo, colors, and domain options so clients experience your firm — not a third-party
                  vendor dump. Themes match the polish of the CandidPortal default experience.
                </p>
              </article>
              <article className="mkt-wl-card">
                <h3>Quote → contract → invoice</h3>
                <p>
                  End-to-end commercial workflow for agents and account managers. Track proposals,
                  close deals, invoice clients, and reconcile commissions in one CRM.
                </p>
              </article>
              <article className="mkt-wl-card">
                <h3>Frank for every seat</h3>
                <p>
                  Shared AI bandwidth across your team: draft proposals, triage tickets, prep renewal
                  playbooks, and hand hard tasks to Candid specialists when phones need dialing.
                </p>
              </article>
              <article className="mkt-wl-card">
                <h3>Marketplace fulfillment</h3>
                <p>
                  Tap 300+ providers across voice, data, cyber, cloud, payments, and more — without
                  becoming a carrier expert overnight. Candid backs the delivery.
                </p>
              </article>
              <article className="mkt-wl-card">
                <h3>Helpdesk that scales you</h3>
                <p>
                  Client tickets with full service context. Escalate to Candid when you want backup —
                  or keep first-line support in-house with Frank assist.
                </p>
              </article>
              <article className="mkt-wl-card">
                <h3>Advisor-ready packaging</h3>
                <p>
                  Accountants and wealth firms: package tech &amp; utilities optimization as a
                  recurring advisory service. Show ROI in the portal your clients already trust.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="mkt-section">
          <div className="mkt-wrap">
            <div className="mkt-section-head">
              <div className="mkt-kicker">Partner vs DIY</div>
              <h2>What you get when you stop cobbling tools.</h2>
            </div>
            <table className="mkt-compare">
              <thead>
                <tr>
                  <th>Capability</th>
                  <th>Spreadsheet + email</th>
                  <th>Candid IQ white-label</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Client-facing portal</td>
                  <td className="mkt-no">—</td>
                  <td className="mkt-yes">Your brand</td>
                </tr>
                <tr>
                  <td>Multi-provider quoting</td>
                  <td className="mkt-no">Manual</td>
                  <td className="mkt-yes">Marketplace</td>
                </tr>
                <tr>
                  <td>Contract &amp; renewal tracking</td>
                  <td className="mkt-no">Fragile</td>
                  <td className="mkt-yes">Vault + radar</td>
                </tr>
                <tr>
                  <td>AI + human execution</td>
                  <td className="mkt-no">—</td>
                  <td className="mkt-yes">Frank + specialists</td>
                </tr>
                <tr>
                  <td>Invoicing &amp; commissions</td>
                  <td className="mkt-no">Separate tools</td>
                  <td className="mkt-yes">Built-in</td>
                </tr>
                <tr>
                  <td>Helpdesk with service memory</td>
                  <td className="mkt-no">Generic inbox</td>
                  <td className="mkt-yes">Context-aware</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mkt-section">
          <div className="mkt-wrap">
            <div className="mkt-section-head center">
              <div className="mkt-kicker">Ideal partners</div>
              <h2>Who this is for</h2>
            </div>
            <div className="mkt-features">
              <article className="mkt-feature">
                <div className="mkt-feature-icon">IT</div>
                <h3>IT companies &amp; MSPs</h3>
                <p>
                  Expand beyond break/fix into telecom, payments, and spend optimization — with a
                  portal your clients will actually use.
                </p>
              </article>
              <article className="mkt-feature">
                <div className="mkt-feature-icon">CPA</div>
                <h3>Accountants &amp; bookkeepers</h3>
                <p>
                  Turn vendor chaos into a managed service. Show measurable OpEx reductions next to the
                  P&amp;L you already own.
                </p>
              </article>
              <article className="mkt-feature">
                <div className="mkt-feature-icon">WM</div>
                <h3>Wealth &amp; advisory firms</h3>
                <p>
                  Offer business-owner clients a candid look at tech &amp; utilities waste — packaged as
                  strategic advice, delivered through your branded hub.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="mkt-wrap" id="cta">
          <div className="mkt-cta">
            <div>
              <h2>Put your name on the portal. Keep Candid in the engine room.</h2>
              <p>
                We&apos;ll walk through branding, seat packs, Frank bandwidth, and how commissions flow
                for your agents.
              </p>
            </div>
            <div className="mkt-cta-actions">
              <a
                href="https://candid.solutions/contact-us/"
                target="_blank"
                rel="noreferrer"
                className="mkt-btn mkt-btn--primary mkt-btn--lg"
              >
                Talk with partnerships
              </a>
              <Link
                href="/welcome"
                className="mkt-btn mkt-btn--outline mkt-btn--lg mkt-btn--on-dark"
              >
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
