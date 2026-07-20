import type { Metadata } from 'next';
import Link from 'next/link';
import { CandidLogo } from '@/components/CandidLogo';
import '../welcome/welcome.css';
import './dev-matrix.css';

export const metadata: Metadata = {
  title: 'Candid IQ — Feature Matrix',
  description: 'Platform capabilities by audience and status: available, roadmap, and suggested.',
  robots: { index: false, follow: false },
};

type Status = 'Available' | 'Roadmap' | 'Suggested';

type Feature = {
  feature: string;
  description: string;
  status: Status;
  note?: string;
};

const CUSTOMER_FEATURES: Feature[] = [
  {
    feature: 'Free savings analysis signup',
    description:
      'Prospect flow: upload a bill (or skip it), pick categories, get analysis or quotes — marketplace-aware prefill',
    status: 'Available',
  },
  {
    feature: 'Quote requests (no bill needed)',
    description: '"What are you looking for" path from marketplace/landing straight into a quote workflow',
    status: 'Available',
  },
  {
    feature: 'Member dashboard',
    description: 'Savings summary, active analyses, tasks at a glance',
    status: 'Available',
  },
  {
    feature: 'My Services',
    description: 'Inventory of active services/contracts per provider with terms and renewal dates',
    status: 'Available',
  },
  {
    feature: 'Savings analyses & reviews',
    description: 'Statement analysis pipeline; findings reviewed and published to the customer',
    status: 'Available',
  },
  {
    feature: 'Find Solutions marketplace',
    description: 'Browse categories/providers, open quote requests from inside the portal',
    status: 'Available',
  },
  {
    feature: 'Messages / support',
    description: 'Two-way messaging with the Candid team; tickets tied to your services and history',
    status: 'Available',
  },
  {
    feature: 'Contract data & renewal dates',
    description: 'Contract terms tracked on services/customer records',
    status: 'Available',
  },
  {
    feature: 'Account settings & profile',
    description: 'Contact info, preferences, alt email/website fields',
    status: 'Available',
  },
  {
    feature: 'Tech Spend concierge (bank/card feed)',
    description: 'Connected spend feed that flags SaaS/vendor charges vs known contracts',
    status: 'Roadmap',
    note: 'Built, held back',
  },
  {
    feature: 'Member-facing Frank AI chat',
    description: 'Customer-side conversational AI to open tasks, ask "is this a good deal?"',
    status: 'Roadmap',
    note: 'Admin-side AI exists',
  },
  {
    feature: 'Utilities command center',
    description: 'Electric/gas/water/waste accounts, disputes, and rate plans beside IT stack',
    status: 'Roadmap',
  },
  {
    feature: 'Agent/MCP hooks',
    description: 'Hand tasks to Frank from ChatGPT/Claude/internal agents',
    status: 'Roadmap',
  },
  {
    feature: 'Renewal radar alerts',
    description: 'Proactive 90/60/30-day notifications (email/SMS) before auto-renew windows close',
    status: 'Suggested',
  },
  {
    feature: 'Price benchmark library',
    description:
      'Self-serve "what others pay" ranges per category/vendor — the single stickiest retention feature in this market',
    status: 'Suggested',
  },
  {
    feature: 'Zombie seat / usage detection',
    description: 'SSO or invoice-based detection of unused SaaS seats feeding auto-generated Frank tasks',
    status: 'Suggested',
  },
  {
    feature: 'Savings ledger & ROI report',
    description: 'Running "we saved you $X vs plan cost $Y" statement — makes renewal a no-brainer',
    status: 'Suggested',
  },
  {
    feature: 'E-signature in portal',
    description: 'Sign renegotiated agreements without leaving the portal',
    status: 'Suggested',
  },
  {
    feature: 'Email forwarding intake',
    description: 'forward-a-bill@ address that opens a task automatically (lowest-friction intake there is)',
    status: 'Suggested',
  },
  {
    feature: 'Approval workflows',
    description: 'Multi-stakeholder approve/decline on negotiation targets for larger orgs',
    status: 'Suggested',
  },
  {
    feature: 'Vendor scorecards',
    description: 'Track outage history, support quality, dispute record per vendor',
    status: 'Suggested',
  },
];

const PARTNER_FEATURES: Feature[] = [
  {
    feature: 'Action Center',
    description: 'Unified queue: quote requests, analysis reviews, support tickets',
    status: 'Available',
  },
  {
    feature: 'CRM customers',
    description: 'Customer records, contacts, deals, contracts, communications history',
    status: 'Available',
  },
  { feature: 'Leads management', description: 'Lead capture and pipeline', status: 'Available' },
  {
    feature: 'Quote builder',
    description: 'Create/manage quote packages against customer records',
    status: 'Available',
  },
  {
    feature: 'Contract tools',
    description: 'Contract tracking incl. merge-contracts workflow',
    status: 'Available',
  },
  {
    feature: 'Agents & commissions',
    description: 'Agent roster, commission tracking and views',
    status: 'Available',
  },
  { feature: 'Expenses', description: 'Expense tracking', status: 'Available' },
  {
    feature: 'Marketing hub',
    description: 'Marketing assets, picker, compose bridge',
    status: 'Available',
  },
  {
    feature: 'Team notes',
    description: 'Internal notes with edit/reply threads',
    status: 'Available',
  },
  {
    feature: 'Customer inbox',
    description: 'Admin side of customer messaging threads',
    status: 'Available',
  },
  {
    feature: 'Hank AI assistant',
    description: 'Admin AI with page context — drafts, lookups, task help across views',
    status: 'Available',
  },
  {
    feature: 'Zoho email compose',
    description: 'Send email from within the portal',
    status: 'Available',
  },
  {
    feature: 'Meeting settings',
    description: 'Scheduling config incl. Dialpad number',
    status: 'Available',
  },
  {
    feature: 'White-label client portal',
    description: 'Partner-branded portal (logo, domain, theme) for their clients',
    status: 'Roadmap',
  },
  {
    feature: 'Multi-tenant partner CRM',
    description: 'Partner-scoped books of business with client seat management',
    status: 'Roadmap',
  },
  {
    feature: 'Partner-branded Frank',
    description: "AI under the partner's brand for proposals, triage, renewals",
    status: 'Roadmap',
  },
  {
    feature: 'Quote → contract → invoice workflow',
    description: 'Full commercial chain incl. invoicing',
    status: 'Roadmap',
    note: 'Quotes/CRM live',
  },
  {
    feature: 'Client snapshot reports',
    description:
      'Auto-generated "here\'s what your tech spend looks like" audit as a partner sales weapon — classic partner lead-gen play',
    status: 'Suggested',
  },
  {
    feature: 'Revenue-share dashboard',
    description: 'Partner earnings across marketplace fulfillment, live and forecasted',
    status: 'Suggested',
  },
  {
    feature: 'Co-branded proposal generator',
    description: 'AI-assembled proposals from marketplace pricing + client contract data',
    status: 'Suggested',
  },
  {
    feature: 'Partner onboarding kit',
    description: 'Templated launch: branding, imported clients, first-campaign playbook',
    status: 'Suggested',
  },
  {
    feature: 'SLA/ticket escalation tiers',
    description: 'Partner-defined support tiers with routing into Candid specialists',
    status: 'Suggested',
  },
  {
    feature: 'Bulk client import & enrichment',
    description: 'CSV import with auto-enrichment of accounts',
    status: 'Suggested',
  },
];

function statusClass(status: Status) {
  if (status === 'Available') return 'matrix-pill matrix-pill--live';
  if (status === 'Roadmap') return 'matrix-pill matrix-pill--roadmap';
  return 'matrix-pill matrix-pill--suggested';
}

function MatrixTable({ title, subtitle, rows }: { title: string; subtitle: string; rows: Feature[] }) {
  return (
    <section className="matrix-section">
      <h2>{title}</h2>
      <p className="matrix-subtitle">{subtitle}</p>
      <div className="matrix-table-wrap">
        <table className="matrix-table">
          <thead>
            <tr>
              <th>Feature</th>
              <th>Description</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.feature}>
                <td className="matrix-feature">{row.feature}</td>
                <td>{row.description}</td>
                <td>
                  <span className={statusClass(row.status)}>{row.status}</span>
                  {row.note ? <span className="matrix-note">{row.note}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function DevMatrixPage() {
  const counts = (rows: Feature[]) => ({
    live: rows.filter((r) => r.status === 'Available').length,
    roadmap: rows.filter((r) => r.status === 'Roadmap').length,
    suggested: rows.filter((r) => r.status === 'Suggested').length,
  });
  const c = counts(CUSTOMER_FEATURES);
  const p = counts(PARTNER_FEATURES);

  return (
    <div className="mkt matrix-page" data-theme="light">
      <header className="matrix-header">
        <div className="mkt-wrap matrix-header-inner">
          <Link href="/welcome" aria-label="Candid IQ home">
            <CandidLogo size="prospect" lockup />
          </Link>
          <span className="matrix-header-tag">Feature Matrix · internal</span>
        </div>
      </header>

      <main className="mkt-wrap matrix-main">
        <div className="matrix-intro">
          <h1>Candid IQ platform feature matrix</h1>
          <p>
            Capabilities by audience and status. <strong>Available</strong> reflects what is
            implemented in the app today; <strong>Roadmap</strong> is promised or partially built;{' '}
            <strong>Suggested</strong> is recommended based on market direction.
          </p>
          <div className="matrix-legend">
            <span className="matrix-pill matrix-pill--live">Available</span>
            <span className="matrix-pill matrix-pill--roadmap">Roadmap</span>
            <span className="matrix-pill matrix-pill--suggested">Suggested</span>
          </div>
        </div>

        <MatrixTable
          title="Direct customers (businesses)"
          subtitle={`${c.live} available · ${c.roadmap} roadmap · ${c.suggested} suggested`}
          rows={CUSTOMER_FEATURES}
        />
        <MatrixTable
          title="Agents / partners (white-label + internal ops)"
          subtitle={`${p.live} available · ${p.roadmap} roadmap · ${p.suggested} suggested`}
          rows={PARTNER_FEATURES}
        />

        <p className="matrix-footnote">
          Last updated 2026-07-20 · Source: docs/FEATURE_MATRIX.md ·{' '}
          <Link href="/welcome">Back to Candid IQ</Link>
        </p>
      </main>
    </div>
  );
}
