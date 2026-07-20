import type { Metadata } from 'next';
import Link from 'next/link';
import { LandingNav } from '@/components/marketing/LandingNav';
import { LandingFooter } from '@/components/marketing/LandingFooter';
import { DashboardMock } from '@/components/marketing/AppMockups';
import { FrankLiveMock } from '@/components/marketing/FrankLiveMock';
import { FrankFlowDemo } from '@/components/marketing/FrankFlowDemo';
import { MarketplaceShowcase } from '@/components/marketing/MarketplaceShowcase';
import { SavingsTicker } from '@/components/marketing/SavingsTicker';
import { buildSignupHref } from '@/lib/marketing/signup';
import './welcome.css';

export const metadata: Metadata = {
  title: 'Candid IQ — Business tech & utilities, managed with Frank',
  description:
    'One-stop marketplace for technology and utilities management, spend savings, and AI that finishes the work. Built by Candid Solutions for businesses and white-label partners.',
};

const TASKS = [
  { text: 'Negotiate our Comcast renewal before auto-renew', result: '$2.9k/yr' },
  { text: 'Audit SaaS stack — find zombie seats', result: '41 seats' },
  { text: 'Quote fiber + UCaaS for 3 locations', result: '4 options' },
  { text: 'Fight the card-processing rate hike', result: '−0.38%' },
  { text: 'Sit on hold with the ISP about outages', result: 'Escalated' },
  { text: 'Compare cyber quotes that actually fit HIPAA', result: 'Shortlist' },
  { text: 'Cancel the unused Zoom Phone trunk', result: 'Done' },
  { text: 'Pull every contract expiring in 90 days', result: '12 found' },
  { text: 'Benchmark Microsoft 365 vs true market', result: 'Fair price' },
  { text: 'Open a helpdesk ticket AND get it resolved', result: 'Closed' },
];

export default function WelcomePage() {
  const marquee = [...TASKS, ...TASKS];

  return (
    <div className="mkt" data-theme="light">
      <LandingNav active="home" />

      <main>
        <section className="mkt-wrap mkt-hero">
          <div>
            <div className="mkt-eyebrow">
              <span className="mkt-eyebrow-dot" />
              Meet Frank — our candid AI (literally)
            </div>
            <h1>
              You&apos;ve never been so productive <em>doing less</em> with business tech.
            </h1>
            <p className="mkt-hero-lead">
              We&apos;re <strong>Candid</strong>. So is <strong>Frank</strong> — same word, same
              attitude: honest, direct, allergic to vendor fluff. Bring us your technology, utilities,
              payments, and spend. Frank tells you what things should cost and builds the plan; Candid
              specialists make the calls, run the negotiations, and close it out. You approve — and
              take the credit.
            </p>
            <div className="mkt-hero-cta">
              <a href={buildSignupHref({ intent: 'analysis' })} className="mkt-btn mkt-btn--primary mkt-btn--lg">
                Start with one task
              </a>
              <Link href="/welcome/partners" className="mkt-btn mkt-btn--outline mkt-btn--lg">
                I&apos;m a partner
              </Link>
            </div>
            <div className="mkt-hero-meta">
              <div>
                <strong>300+</strong>
                providers in supply chain
              </div>
              <div>
                <strong>20+ yrs</strong>
                Candid Solutions expertise
              </div>
              <div>
                <strong>1 portal</strong>
                contracts · spend · support
              </div>
            </div>
          </div>
          <FrankLiveMock />
        </section>

        <div className="mkt-marquee" aria-hidden>
          <div className="mkt-marquee-track">
            {marquee.map((t, i) => (
              <div key={`${t.text}-${i}`} className="mkt-chip mkt-chip--star">
                {t.text}
                <span>{t.result}</span>
              </div>
            ))}
          </div>
        </div>

        <FrankFlowDemo />

        <section className="mkt-section" id="audiences">
          <div className="mkt-wrap">
            <div className="mkt-section-head center">
              <div className="mkt-kicker">Built for two kinds of operators</div>
              <h2>Run it yourself — or white-label it for your clients.</h2>
              <p>
                Whether you run one business or manage fifty clients, it&apos;s the same engine
                underneath: a marketplace that knows real prices, an AI that tells the truth, and
                specialists who finish the job.
              </p>
            </div>
            <div className="mkt-split">
              <article className="mkt-audience mkt-audience--biz">
                <div className="mkt-kicker">For businesses</div>
                <h3>Stop babysitting vendors.</h3>
                <p>
                  One portal for contracts, spend, quotes, and support. Frank finds the savings and
                  flags the renewals; specialists do the negotiating — while your team gets back to
                  running the business instead of the phone tree.
                </p>
                <ul>
                  <li>Tech &amp; utilities marketplace with guided quoting</li>
                  <li>Contract vault + renewal radar with pricing leverage</li>
                  <li>Statement analysis &amp; spend intelligence</li>
                  <li>Helpdesk that routes to humans who know your stack</li>
                  <li>Frank tasks: negotiate, research, escalate, close</li>
                </ul>
                <a href={buildSignupHref({ intent: 'analysis' })} className="mkt-btn mkt-btn--primary">
                  Get a free savings analysis
                </a>
              </article>
              <article className="mkt-audience mkt-audience--partner">
                <div className="mkt-kicker">For partners</div>
                <h3>Your brand. Our engine.</h3>
                <p>
                  IT companies, MSPs, accountants, and wealth advisors get a white-labeled portal —
                  quoting, invoicing, contracts, CRM, helpdesk, and Frank — so you deliver a full
                  service experience without building the platform.
                </p>
                <ul>
                  <li>White-label client portal &amp; multi-tenant CRM</li>
                  <li>Quote → contract → invoice workflows</li>
                  <li>Agent commissions &amp; deal desks</li>
                  <li>AI workforce for proposals, tickets, and renewals</li>
                  <li>Marketplace fulfillment backed by Candid</li>
                </ul>
                <Link href="/welcome/partners" className="mkt-btn mkt-btn--primary">
                  Explore partner platform
                </Link>
              </article>
            </div>
          </div>
        </section>

        <section className="mkt-section" id="product">
          <div className="mkt-wrap mkt-stage">
            <div className="mkt-stage-copy">
              <div className="mkt-kicker">One-stop marketplace</div>
              <h2>Every category your business buys — in one place.</h2>
              <p>
                Voice, data, cloud, cyber, payments, utilities, managed IT. Browse, compare, and open
                quote requests against Candid&apos;s supply chain of 300+ providers — then track
                everything in the same portal.
              </p>
              <ul className="mkt-checklist">
                <li>
                  <span className="mkt-check">✓</span>
                  Side-by-side proposals with clear savings math
                </li>
                <li>
                  <span className="mkt-check">✓</span>
                  Upload current contracts — Frank flags waste &amp; leverage
                </li>
                <li>
                  <span className="mkt-check">✓</span>
                  Order, onboard, and support without leaving Candid IQ
                </li>
              </ul>
            </div>
            <MarketplaceShowcase />
          </div>
        </section>

        <SavingsTicker />

        <section className="mkt-section" id="frank">
          <div className="mkt-wrap mkt-stage" style={{ direction: 'rtl' }}>
            <div className="mkt-stage-copy" style={{ direction: 'ltr' }}>
              <div className="mkt-kicker">Frank finishes what AI starts</div>
              <h2>AI plans it. Humans close it. You approve.</h2>
              <p>
                Chatbots draft letters nobody sends. Frank drafts the playbook — then Candid
                specialists make the calls, survive the hold music, argue with carriers, and update
                your portal when it&apos;s actually done. Around here, &quot;done&quot; means done.
              </p>
              <ul className="mkt-checklist">
                <li>
                  <span className="mkt-check">✓</span>
                  Bandwidth-based plans for negotiation &amp; ops tasks
                </li>
                <li>
                  <span className="mkt-check">✓</span>
                  Real-time task updates inside the portal
                </li>
                <li>
                  <span className="mkt-check">✓</span>
                  You stay in control — approve strategy before outreach
                </li>
              </ul>
            </div>
            <div style={{ direction: 'ltr' }}>
              <DashboardMock />
            </div>
          </div>
        </section>

        <section className="mkt-section">
          <div className="mkt-wrap">
            <div className="mkt-section-head">
              <div className="mkt-kicker">Platform capabilities</div>
              <h2>Everything your tech spend has been getting away with, handled.</h2>
              <p>
                From &quot;why is this bill higher?&quot; to full vendor management — one platform that
                keeps score, keeps receipts, and keeps getting smarter.
              </p>
            </div>
            <div className="mkt-features">
              <article className="mkt-feature">
                <div className="mkt-feature-icon">01</div>
                <h3>Spend &amp; pricing intelligence</h3>
                <p>
                  Benchmark every quote against real market outcomes. Walk into renewals knowing
                  exactly what everyone else pays — telecom, SaaS, payments, and utilities.
                </p>
              </article>
              <article className="mkt-feature">
                <div className="mkt-feature-icon">02</div>
                <h3>Autonomous negotiations</h3>
                <p>
                  Frank prepares the brief. Specialists run the back-and-forth. You approve the target
                  and watch savings land in the portal.
                </p>
              </article>
              <article className="mkt-feature">
                <div className="mkt-feature-icon">03</div>
                <h3>Contract vault &amp; renewal radar</h3>
                <p>
                  Every MSA, order form, and utility agreement in one place — with alerts before you lose
                  negotiating power.
                </p>
              </article>
              <article className="mkt-feature">
                <div className="mkt-feature-icon">04</div>
                <h3>Quote → invoice → CRM</h3>
                <p>
                  Full commercial workflow for direct customers and partner agents: proposals, deals,
                  commissions, and customer records.
                </p>
              </article>
              <article className="mkt-feature">
                <div className="mkt-feature-icon">05</div>
                <h3>Helpdesk with memory</h3>
                <p>
                  Tickets that know your services, contracts, and prior analyses — so support isn&apos;t
                  starting from zero every time.
                </p>
              </article>
              <article className="mkt-feature">
                <div className="mkt-feature-icon">06</div>
                <h3>Tech spend concierge</h3>
                <p>
                  Connect bank &amp; card activity to flag SaaS and vendor spend that doesn&apos;t match
                  known contracts — then open a Frank task to clean it up.
                </p>
              </article>
              <article className="mkt-feature">
                <div className="mkt-feature-icon">07</div>
                <h3>Utilities command center</h3>
                <p>
                  Electric, gas, water, waste — track accounts, disputes, and rate plans alongside your
                  IT stack so facilities and IT finally share a system of record.
                </p>
              </article>
              <article className="mkt-feature">
                <div className="mkt-feature-icon">08</div>
                <h3>White-label AI workforce</h3>
                <p>
                  Partner-branded Frank for proposals, ticket triage, renewal playbooks, and client
                  Q&amp;A — your whole book of business, running on our engine.
                </p>
              </article>
              <article className="mkt-feature">
                <div className="mkt-feature-icon">09</div>
                <h3>Agent / MCP hooks</h3>
                <p>
                  Hand hard tasks from Claude, ChatGPT, or your internal agents to Frank when the job
                  needs a phone call, a negotiation, or a human in the loop.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="mkt-section" id="how">
          <div className="mkt-wrap">
            <div className="mkt-section-head center">
              <div className="mkt-kicker">How it works</div>
              <h2>We want you to do the minimum.</h2>
              <p>Tell us what needs to happen. Frank breaks it down. Specialists pick it up. Done.</p>
            </div>
            <div className="mkt-steps">
              <article className="mkt-step">
                <h3>Tell us what you need</h3>
                <p>
                  A prompt, a forwarded invoice, a screenshot of a renewal notice, or a quote request in
                  the marketplace. However it arrives, we figure it out.
                </p>
              </article>
              <article className="mkt-step">
                <h3>Frank plans. Humans execute.</h3>
                <p>
                  AI researches, benchmarks, and drafts the playbook. Background-checked Candid
                  specialists make the calls and push the paperwork.
                </p>
              </article>
              <article className="mkt-step">
                <h3>Done. Actually done.</h3>
                <p>
                  Results land in your portal — contracts updated, savings logged, tickets closed. No
                  &quot;here&apos;s a draft letter&quot; and good luck.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="mkt-section">
          <div className="mkt-wrap">
            <div className="mkt-outcomes">
              <div className="mkt-outcome">
                <div className="mkt-outcome-val">$48k</div>
                <p>Avg. annual savings identified on multi-location tech stacks</p>
              </div>
              <div className="mkt-outcome">
                <div className="mkt-outcome-val">18%</div>
                <p>Typical discount unlocked on carrier renewals with leverage</p>
              </div>
              <div className="mkt-outcome">
                <div className="mkt-outcome-val">90d</div>
                <p>Renewal radar window so you never auto-renew blind</p>
              </div>
              <div className="mkt-outcome">
                <div className="mkt-outcome-val">1 hub</div>
                <p>Marketplace, CRM, helpdesk, and Frank — not six more tools</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mkt-section" id="pricing">
          <div className="mkt-wrap">
            <div className="mkt-section-head center">
              <div className="mkt-kicker">Pick your bandwidth</div>
              <h2>Plans that match how much work you want finished.</h2>
              <p>
                Every plan bundles Frank with real specialist capacity — negotiations, audits, quotes,
                and ops tasks. Marketplace access and the portal are always included. Need more
                mid-cycle? Add a boost.
              </p>
            </div>
            <div className="mkt-pricing">
              <article className="mkt-plan">
                <h3>Essentials</h3>
                <div className="mkt-plan-price">
                  $149<span>/mo</span>
                </div>
                <div className="mkt-plan-note">~3–5 Frank tasks / month</div>
                <ul>
                  <li>Portal + marketplace</li>
                  <li>Contract vault</li>
                  <li>1 business location</li>
                  <li>Standard helpdesk</li>
                </ul>
                <a href={buildSignupHref({ intent: 'analysis' })} className="mkt-btn mkt-btn--outline">
                  Get started
                </a>
              </article>
              <article className="mkt-plan mkt-plan--featured">
                <div className="mkt-plan-badge">Most popular</div>
                <h3>Complete</h3>
                <div className="mkt-plan-price">
                  $399<span>/mo</span>
                </div>
                <div className="mkt-plan-note">~8–12 Frank tasks / month</div>
                <ul>
                  <li>Everything in Essentials</li>
                  <li>Unlimited analysis</li>
                  <li>Managed Disputes + Renegotiations</li>
                  <li>HelpDesk</li>
                  <li>Spend intelligence</li>
                  <li>Up to 5 locations</li>
                </ul>
                <a href={buildSignupHref({ intent: 'analysis' })} className="mkt-btn mkt-btn--primary">
                  Get started
                </a>
              </article>
              <article className="mkt-plan">
                <h3>Scale</h3>
                <div className="mkt-plan-price">
                  $899<span>/mo</span>
                </div>
                <div className="mkt-plan-note">~20–30 Frank tasks / month</div>
                <ul>
                  <li>Everything in Complete</li>
                  <li>Dedicated specialist hours</li>
                  <li>Multi-entity CRM</li>
                  <li>Custom playbooks</li>
                </ul>
                <a href={buildSignupHref({ intent: 'quote' })} className="mkt-btn mkt-btn--outline">
                  Get started
                </a>
              </article>
              <article className="mkt-plan">
                <h3>Partner</h3>
                <div className="mkt-plan-price">
                  Custom
                </div>
                <div className="mkt-plan-note">White-label + seat packs</div>
                <ul>
                  <li>Your brand on the portal</li>
                  <li>Agent / client seats</li>
                  <li>Quote, invoice, commissions</li>
                  <li>Shared Frank bandwidth</li>
                </ul>
                <Link href="/welcome/partners" className="mkt-btn mkt-btn--dark">
                  Partner details
                </Link>
              </article>
            </div>
            <p className="mkt-pricing-footnote">
              Bandwidth refreshes monthly, and one good negotiation typically pays for the plan many
              times over. Frankly, the math isn&apos;t close.
            </p>
          </div>
        </section>

        <section className="mkt-section">
          <div className="mkt-wrap">
            <div className="mkt-quotes">
              <blockquote className="mkt-quote">
                <p>
                  “Frank explained the rate hike better than the processor. Then Candid actually called
                  them. Good team.”
                </p>
                <footer>— Ops lead, multi-site retail</footer>
              </blockquote>
              <blockquote className="mkt-quote">
                <p>
                  “We white-labeled the portal for our accounting clients. Quoting and renewals finally
                  live in one place — and it looks like us.”
                </p>
                <footer>— Partner principal, advisory firm</footer>
              </blockquote>
              <blockquote className="mkt-quote">
                <p>
                  “I forwarded one renewal email. Four follow-ups later we were $18k/year better. I
                  barely lifted a finger.”
                </p>
                <footer>— Founder who hates phone trees</footer>
              </blockquote>
            </div>
          </div>
        </section>

        <section className="mkt-wrap" id="cta">
          <div className="mkt-cta">
            <div>
              <h2>It&apos;s time to be candid about your stack.</h2>
              <p>
                Start with one negotiation, one quote package, or a partner walkthrough. Frank will take
                it from there — and Candid will finish it.
              </p>
            </div>
            <div className="mkt-cta-actions">
              <a href={buildSignupHref({ intent: 'analysis' })} className="mkt-btn mkt-btn--primary mkt-btn--lg">
                Get a free analysis
              </a>
              <a href={buildSignupHref({ intent: 'quote' })} className="mkt-btn mkt-btn--outline mkt-btn--lg mkt-btn--on-dark">
                Request a quote
              </a>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
