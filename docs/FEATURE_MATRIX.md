# CandidPortal Feature Matrix

Last updated: 2026-07-20

Status legend:

- **Available** — implemented in the app today (verified against actual views/routes in `CandidApp.tsx` and admin components, not marketing copy)
- **Roadmap** — promised on the marketing site and/or partially built but not shipped
- **Suggested** — recommended additions based on market direction (price-benchmarking clarity, "we finish the work" concierge model, partner white-labeling)

## Direct customers (businesses)

| Feature | Description | Status |
|---|---|---|
| Free savings analysis signup | Prospect flow: upload a bill (or skip it), pick categories, get analysis or quotes — marketplace-aware prefill | Available |
| Quote requests (no bill needed) | "What are you looking for" path from marketplace/landing straight into a quote workflow | Available |
| Member dashboard | Savings summary, active analyses, tasks at a glance | Available |
| My Services | Inventory of active services/contracts per provider with terms and renewal dates | Available |
| Savings analyses & reviews | Statement analysis pipeline; findings reviewed and published to the customer | Available |
| Find Solutions marketplace | Browse categories/providers, open quote requests from inside the portal | Available |
| Messages / support | Two-way messaging with the Candid team; tickets tied to your services and history | Available |
| Contract data & renewal dates | Contract terms tracked on services/customer records | Available |
| Account settings & profile | Contact info, preferences, alt email/website fields | Available |
| Tech Spend concierge (bank/card feed) | Plaid-connected spend feed that flags SaaS/vendor charges vs known contracts | Roadmap (built, held back) |
| Member-facing Frank AI chat | Customer-side conversational AI to open tasks, ask "is this a good deal?" | Roadmap (admin-side AI exists; marketing promises it) |
| Utilities command center | Electric/gas/water/waste accounts, disputes, and rate plans beside IT stack | Roadmap |
| Agent/MCP hooks | Hand tasks to Frank from ChatGPT/Claude/internal agents | Roadmap |
| Renewal radar alerts | Proactive 90/60/30-day notifications (email/SMS) before auto-renew windows close | Suggested |
| Price benchmark library | Self-serve "what others pay" ranges per category/vendor — the single stickiest retention feature in this market | Suggested |
| Zombie seat / usage detection | SSO or invoice-based detection of unused SaaS seats feeding auto-generated Frank tasks | Suggested |
| Savings ledger & ROI report | Running "we saved you $X vs plan cost $Y" statement — makes renewal a no-brainer | Suggested |
| E-signature in portal | Sign renegotiated agreements without leaving the portal | Suggested |
| Email forwarding intake | forward-a-bill@ address that opens a task automatically (lowest-friction intake there is) | Suggested |
| Approval workflows | Multi-stakeholder approve/decline on negotiation targets for larger orgs | Suggested |
| Vendor scorecards | Track outage history, support quality, dispute record per vendor | Suggested |

## Agents / partners (white-label + internal ops)

| Feature | Description | Status |
|---|---|---|
| Action Center | Unified queue: quote requests, analysis reviews, support tickets | Available |
| CRM customers | Customer records, contacts, deals, contracts, communications history | Available |
| Leads management | Lead capture and pipeline | Available |
| Quote builder | Create/manage quote packages against customer records | Available |
| Contract tools | Contract tracking incl. merge-contracts workflow | Available |
| Agents & commissions | Agent roster, commission tracking and views | Available |
| Expenses | Expense tracking | Available |
| Marketing hub | Marketing assets, picker, compose bridge | Available |
| Team notes | Internal notes with edit/reply threads | Available |
| Customer inbox | Admin side of customer messaging threads | Available |
| Hank AI assistant | Admin AI with page context — drafts, lookups, task help across views | Available |
| Zoho email compose | Send email from within the portal | Available |
| Meeting settings | Scheduling config incl. Dialpad number | Available |
| White-label client portal | Partner-branded portal (logo, domain, theme) for their clients | Roadmap |
| Multi-tenant partner CRM | Partner-scoped books of business with client seat management | Roadmap |
| Partner-branded Frank | AI under the partner's brand for proposals, triage, renewals | Roadmap |
| Quote → contract → invoice workflow | Full commercial chain incl. invoicing | Roadmap (quotes/CRM live; invoicing promised) |
| Client snapshot reports | Auto-generated "here's what your tech spend looks like" audit as a partner sales weapon — classic partner lead-gen play | Suggested |
| Revenue-share dashboard | Partner earnings across marketplace fulfillment, live and forecasted | Suggested |
| Co-branded proposal generator | AI-assembled proposals from marketplace pricing + client contract data | Suggested |
| Partner onboarding kit | Templated launch: branding, imported clients, first-campaign playbook | Suggested |
| SLA/ticket escalation tiers | Partner-defined support tiers with routing into Candid specialists | Suggested |
| Bulk client import & enrichment | CSV import with auto-enrichment of accounts (enrichment tooling already exists in the repo) | Suggested |
