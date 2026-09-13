# CandidIQ Beta — Bug & Readiness Checklist

**Purpose:** Run this before inviting the first beta customer.  
**Source:** Codebase review, `FEATURE_MATRIX.md`, `RELEASE_REVIEW_2026-07-13.md`, portal API routes, Aug 2026 product state.  
**How to use:** Mark each item **Pass / Fail / Block / Hide / N/A**. Fix all **P0 Block** items before beta invite #1.

---

## Severity legend

| Level | Meaning |
|-------|---------|
| **P0 Block** | Beta customer would hit this on a core path — fix or hide feature before invite |
| **P1 Fix soon** | Embarrassing or confusing; OK to warn beta users if documented |
| **P2 Defer** | Polish, edge case, or admin-only — track but don’t block beta |
| **Hide** | Turn off for beta (`NEXT_PUBLIC_ENABLE_TECH_SPEND=0` or don’t demo) |

---

## A. Pre-beta infrastructure (do first)

These look like “app bugs” but are usually env/config.

| # | Sev | Check | Pass? | Notes |
|---|-----|-------|-------|-------|
| A.1 | P0 | Production Supabase migrations applied through latest quote/contract migrations (`contract_submit_actions`, `quote_customer_acceptance`, `contract_deal_pipeline`, etc.) | | See `docs/RELEASE_REVIEW_2026-07-13.md` §0 |
| A.2 | P0 | `NEXT_PUBLIC_PORTAL_INVITES_ENABLED=true` on production Vercel | | Default is **off** — invites save access but **don’t email** without this |
| A.3 | P0 | Shared Zoho mailbox connected for portal invite + member notification email | | Admin Settings → Shared system mailbox |
| A.4 | P0 | Supabase Auth redirect URLs include `https://www.candidiq.app/auth/callback` | | Magic links fail if missing |
| A.5 | P0 | `ANTHROPIC_API_KEY` set — statement parse + Frank chat | | `/api/parse-statement` returns 503 without it |
| A.6 | P1 | `NEXT_PUBLIC_SITE_URL` / auth callback matches production domain | | Cross-device magic links |
| A.7 | P1 | Hard refresh / PWA cache cleared after deploy | | Stale JS causes “random” UI bugs |

---

## B. Beta scope — what to show vs hide

| Feature | Beta status | Action |
|---------|-------------|--------|
| My Services + savings snapshot | ✅ **Show** | Core beta hook |
| Savings analysis upload → publish | ✅ **Show** | Strongest ROI story (merchant best) |
| Quote request → published proposal | ✅ **Show** | Second core loop |
| Message Center | ✅ **Show** | Support + feedback channel |
| Find Solutions marketplace | ✅ **Show** | Demo-friendly |
| Accept quote | ✅ **Show** | If migrations applied (§A.1) |
| **Tech Spend (Plaid)** | ⚠️ **Hide recommended** | Set `NEXT_PUBLIC_ENABLE_TECH_SPEND=0` on prod until stable; Wayne demo OK for internal only |
| Member Frank FAB (`MemberAssistantPanel`) | ⚠️ **Show with caveats** | Works but limited vs marketing; set expectations |
| Member Frank in marketplace only | ✅ OK | Lighter-weight AI |
| Utilities command center | ❌ **Hide** | Not shipped |
| White-label / partner portal | ❌ **Hide** | Not ready |
| Billing / plan tiers in-app | ❌ **N/A** | No Stripe — beta is free |
| Terms of Service / Privacy links | P1 | Add before beta or send PDF separately |

---

## C. P0 — Member onboarding & auth

| # | Sev | Issue / test | Code / area | Pass? |
|---|-----|--------------|-------------|-------|
| C.1 | P0 | **Portal invite → email arrives → magic link → lands in `/app`** | `/api/admin/portal-invite`, auth callback | |
| C.2 | P0 | **Set password flow** works after first login (`/auth/set-password`) | `set-password/page.tsx` | |
| C.3 | P0 | Invited contact sees **correct customer data** (not wrong account / empty services) | `session-scope`, CRM link on contact | |
| C.4 | P0 | Contact with portal access but **no Supabase auth user** gets clean error, not blank screen | `team-members` route | |
| C.5 | P0 | **Login as customer** (admin preview) and **exit** restores admin session | Admin preview panel | |
| C.6 | P1 | Member with **location-scoped** portal access only sees allowed locations | `PortalAccessFields` locationIds | |

---

## D. P0 — My Services & dashboard

| # | Sev | Issue / test | Pass? | Notes |
|---|-----|--------------|-------|-------|
| D.1 | P0 | My Services loads with contracts/deals from Supabase (not empty for seeded accounts) | | |
| D.2 | P0 | Service cards show **amount + savings** for pending-contract services | Recent `ServiceCard` / snapshot work | |
| D.3 | P0 | Renewal / expiry labels correct (not “expired” on active pending deals) | | |
| D.4 | P1 | My Services **snapshot strip** (monthly/yearly savings) renders without NaN | `member-services-snapshot.ts` | |
| D.5 | P1 | External (non-Candid) services display correctly | | |
| D.6 | P2 | PWA / mobile bottom nav doesn’t overlap content | `CandidApp.tsx` mobile nav | |

---

## E. P0 — Savings analysis path

| # | Sev | Issue / test | Pass? | Notes |
|---|-----|--------------|-------|-------|
| E.1 | P0 | Member submits bill analysis → **confirmation** → appears in admin Action Center | `analysis-reviews` | |
| E.2 | P0 | Admin publishes analysis → **member notification** (in-app + email if prefs on) | publish loop | |
| E.3 | P0 | Member opens published proposal / savings view | `MemberSavingsProposal` | |
| E.4 | P0 | **Merchant PDF parse** succeeds on a real statement | `/api/parse-statement`, Anthropic | |
| E.5 | P1 | Duplicate bill upload handled gracefully | `bill-fingerprints` | |
| E.6 | P1 | `StatementEngine` still has `@ts-nocheck` / legacy TODOs — verify **member-facing** path uses maintained APIs | Prefer portal analysis flow over raw StatementEngine embed | |
| E.7 | P2 | UCaaS / non-merchant analysis paths | Lower priority for beta wedge | |

---

## F. P0 — Quote request path

| # | Sev | Issue / test | Pass? | Notes |
|---|-----|--------------|-------|-------|
| F.1 | P0 | New quote from portal → admin **quote_request** ticket | `quote-request/route.ts` | |
| F.2 | P0 | Admin publishes quote → member sees proposal | `MemberQuoteProposal` | |
| F.3 | P0 | **Accept quote** completes without 503 migration errors | `quote-accept/route.ts` — needs migrations | |
| F.4 | P1 | Quote with **multiple locations** — location picker loads | `NewQuoteFlowModal` | |
| F.5 | P1 | Internet / SCOUT quote workflow (if demoing internet) | Admin-only complexity | |
| F.6 | P1 | UCaaS proposal “Quote is not available” empty states | `MemberUcaasProposal.tsx` | |
| F.7 | P2 | Nested quote views — duplicate Back buttons | Recent nav fixes — regression test | |

---

## G. P1 — Message Center & support

| # | Sev | Issue / test | Pass? |
|---|-----|--------------|-------|
| G.1 | P0 | Member sends message → admin Customer Inbox receives | |
| G.2 | P0 | Admin reply → member sees in Message Center + alert | |
| G.3 | P1 | Attachments in chat upload/download | |
| G.4 | P1 | Service request from portal creates admin ticket | |
| G.5 | P2 | Push notifications (optional for beta) | |

---

## H. Tech Spend / Plaid — **recommended Hide for beta**

| # | Sev | Issue / test | Pass? | Notes |
|---|-----|--------------|-------|-------|
| H.1 | Hide | **`NEXT_PUBLIC_ENABLE_TECH_SPEND=0`** on production — sidebar should not show Tech Spend | `CandidApp.tsx` L369–370 | Matches July release review intent |
| H.2 | P0 | If enabled: `0073_plaid_tech_spend.sql` applied + Plaid env vars set | | Without: 503 “Plaid not configured” |
| H.3 | P1 | Plaid Link loads (`cdn.plaid.com`) — fails on some networks | `MemberTechSpendView` | |
| H.4 | P1 | Real bank connect → sync → transactions display | `plaid/sync.ts` | |
| H.5 | P1 | Demo-only Wayne seed must **not** appear for real beta customers | `wayne-demo-seed.ts` | |
| H.6 | P1 | Member Frank suggests “Summarize my technology spend” but Tech Spend hidden — confusing | `MemberAssistantPanel` suggestions | Rephrase or hide FAB for beta |
| H.7 | P2 | MoM chart / spend flags accuracy | | |

**Recommendation:** Hide Tech Spend for all beta customers. Re-enable for 1–2 internal power users only after H.2–H.5 pass.

---

## I. P1 — Admin / ops (your team must not break)

| # | Sev | Issue / test | Pass? |
|---|-----|--------------|-------|
| I.1 | P0 | Action Center lists quote + analysis + service tickets | |
| I.2 | P0 | Publish from `AnalysisReviewDetailPanel` / `QuoteRequestDetailPanel` | |
| I.3 | P1 | Account → quote workflow — **single Back**, sidebar nav doesn’t stick on quote | Recent fixes |
| I.4 | P1 | Contract deal workbench after quote accept | `RELEASE_REVIEW` §1 |
| I.5 | P1 | Zoho compose for supplier / customer email | |
| I.6 | P2 | Frank admin assistant on customer record | |
| I.7 | P2 | Commissions / agents views — don’t expose to beta customers | |

---

## J. P1 — Data & CRM quality (beta-specific)

Bad CRM data looks like product bugs.

| # | Sev | Check | Pass? |
|---|-----|-------|-------|
| J.1 | P0 | Beta customer has **deals/contracts** in Supabase linked to customer UUID | |
| J.2 | P0 | Primary contact email matches **portal invite** email | |
| J.3 | P1 | Locations populated (quote flow needs them) | |
| J.4 | P1 | At least one service with renewal date for “My Services” demo | |
| J.5 | P2 | Documents in `customer_records` open from admin (member docs optional) | |
| J.6 | P2 | Run **repair deal locations** if merged accounts look wrong | `repair-deal-locations` |

---

## K. P2 — Known gaps (document to beta, don’t fix before invite)

| Gap | Beta messaging |
|-----|----------------|
| No in-app billing | “Free during beta” |
| No renewal alert emails yet | “We’ll remind you manually” |
| Member Frank ≠ marketing Frank | “AI helps research; team executes negotiations” |
| No utilities module | “Coming later” |
| No SOC 2 badge | “Enterprise security on roadmap” |
| Price benchmark library | Not self-serve yet |
| E-signature in portal | Sign outside portal for now |

---

## L. 30-minute internal smoke (run once before first invite)

Run on production as admin, then as member (Login as customer or real invite).

1. [ ] Send portal invite to test email → complete login + set password  
2. [ ] My Services shows services for that customer  
3. [ ] Submit merchant bill analysis (test PDF)  
4. [ ] Admin: publish analysis → member sees notification  
5. [ ] Submit quote request from marketplace  
6. [ ] Admin: publish quote → member opens proposal  
7. [ ] Message Center: member sends note → admin replies  
8. [ ] Confirm **Tech Spend hidden** (if following hide recommendation)  
9. [ ] Mobile: open portal on phone — nav + My Services usable  

**All steps 1–7 pass → OK to invite beta customer #1.**

---

## M. Beta bug log (fill during beta)

| Date | Customer | Severity | Steps | Owner | Status |
|------|----------|----------|-------|-------|--------|
| | | P0/P1/P2 | | | Open / Fixed / Won't fix |

---

## N. Quick env toggles

| Goal | Setting |
|------|---------|
| Hide Tech Spend | `NEXT_PUBLIC_ENABLE_TECH_SPEND=0` on Vercel production |
| Enable invite emails | `NEXT_PUBLIC_PORTAL_INVITES_ENABLED=true` |
| Disable invite emails (save access only) | unset or `false` |
| Wayne demo (internal) | Seed via `/api/admin/demo/wayne-tech-spend` — **not** for beta clients |

---

*Last updated: August 25, 2026*
