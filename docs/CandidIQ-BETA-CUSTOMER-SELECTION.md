# CandidIQ Beta — 10 Customer Selection Criteria

**Goal:** Pick **10 existing Candid SMB customers** for a **free beta** who will use the portal, give feedback, and tolerate rough edges — then expand to **25 by day 90**.

**Use with:** [CandidIQ-BETA-BUG-CHECKLIST.md](./CandidIQ-BETA-BUG-CHECKLIST.md) (CRM/data checks per selected account).

---

## 1. Who belongs in the founding 10

### Must-have (all 10 should match)

| # | Criterion | Why |
|---|-----------|-----|
| M1 | **Existing Candid Solutions client** with an active relationship (merchant, telecom, UCaaS, or multi-service) | Trust, forgiveness, you know their stack |
| M2 | **Ops-friendly primary contact** — owner, office manager, or ops/finance lead who will actually log in | Beta fails if contact is too senior to use software or too junior to decide |
| M3 | **Responsive** — returns calls/emails within a few days | You need feedback loops |
| M4 | **CRM record in Supabase** with at least **1 deal/contract** loaded | Empty My Services = “broken product” |
| M5 | **Valid email** for portal invite (matches contact on file) | Onboarding blocker |
| M6 | **English-friendly** communication (unless you assign bilingual support) | Support during beta |
| M7 | **Verbally agreed** to free beta + honest feedback (even if informal) | Sets expectations |

### Strong fit (aim for ≥7 of 10)

| # | Criterion | Why |
|---|-----------|-----|
| S1 | **2+ Candid-managed services** (e.g. merchant + telecom) | Shows cross-category portal value |
| S2 | **Renewal in next 6–12 months** on at least one service | Natural first “Frank task” / analysis hook |
| S3 | **Recent bill or statement available** (merchant PDF especially) | Fast path to published savings win |
| S4 | **Single decision-maker** or tight owner + office manager pair | Faster feedback, less committee |
| S5 | **1–5 locations** (not 50+) | Matches product sweet spot; quote flow tested here |
| S6 | **Has felt vendor pain** — rate hike, hold times, surprise renewal | Motivated to engage |
| S7 | **Not a partner/agent account** — end business customer | Beta is direct SMB motion |
| S8 | **Locations populated in CRM** | Quote request flow needs locations |

### Avoid for founding 10

| # | Anti-pattern | Why exclude |
|---|--------------|-------------|
| A1 | **Enterprise / IT department >10 people** | Will ask for SSO, approvals, SOC 2 day one |
| A2 | **MSP reselling to their own clients** | Partner motion — different SKU |
| A3 | **Hostile or high-maintenance accounts** | Beta feedback turns into noise |
| A4 | **No CRM data** — contracts only in email/Excel | Requires import project first |
| A5 | **Legal/compliance blockers** on uploading bills | Can’t complete core loop |
| A6 | **100% satisfied, zero pain** | Won’t log in after week 1 |
| A7 | **Wayne / internal demo accounts** | Not real feedback |

---

## 2. Scoring rubric (pick top 10)

Score each candidate **0–2** per row (max **24**). Invite **top 10** scores ≥**14**.

| Factor | 0 | 1 | 2 |
|--------|---|---|---|
| **Relationship warmth** | Cold / transactional | Good | Strong trust, knows Bryan/team by name |
| **Responsiveness** | Hard to reach | OK | Fast |
| **CRM data quality** | Empty / messy | Some deals | Contracts + locations + contacts clean |
| **Savings potential** | Low spend | Medium | High merchant/telecom spend or renewal soon |
| **Multi-service** | One tiny service | 2 services | 3+ categories |
| **Tech comfort** | Avoids software | Average | Uses apps, will upload a PDF |
| **Feedback quality** | Complainer only | Neutral | Constructive, specific |
| **Story value** | Can’t use case study | Maybe | Would allow anonymized win story |
| **Geography / timezone** | Hard to support | OK | Easy for your team |
| **Beta bandwidth (yours)** | High touch nightmare | Normal | Low drama |
| **First analysis type** | Unclear wedge | Quote only | Merchant statement or renewal ready |
| **Decision simplicity** | Committee | 2 people | One approver |

---

## 3. Ideal mix for the 10 (portfolio balance)

Don’t pick 10 identical merchants. Aim for:

| Segment | Count | First beta action |
|---------|-------|-------------------|
| **Merchant / payments** (statement analysis wedge) | **3–4** | Free processing statement analysis |
| **Telecom / internet** (renewal + quote) | **2–3** | Renewal review or internet quote |
| **UCaaS / voice** | **1–2** | Quote or contract review in My Services |
| **Multi-service “showcase”** | **1–2** | Full portal tour + 2 tasks |

At least **2** should be clients who’ve **complained about vendor hassle** — they’ll engage.

---

## 4. Where to find candidates in the portal

**Admin → Accounts (Customers):**

1. Sort/filter accounts with **most deals** and recent activity  
2. Open record → confirm **contacts**, **locations**, **contracts**  
3. Check **Portal access** section — note if invite already sent  
4. Use **Login as customer** preview — verify My Services not empty  
5. Note best **first analysis**: merchant PDF on file? Telecom renewal date?

**SQL (optional, Supabase):** accounts with deal count + upcoming renewal — ask dev to run if helpful.

---

## 5. Selection worksheet (copy into spreadsheet)

| Rank | Company | Contact | Email | Services | Renewal window | First beta task | CRM OK? | Score (/24) | Wave |
|------|---------|---------|-------|----------|----------------|-----------------|---------|-------------|------|
| 1 | | | | | | | ☐ | | 1 (wk 3–4) |
| 2 | | | | | | | ☐ | | 1 |
| 3 | | | | | | | ☐ | | 1 |
| 4 | | | | | | | ☐ | | 1 |
| 5 | | | | | | | ☐ | | 1 |
| 6 | | | | | | | ☐ | | 2 (wk 5–6) |
| 7 | | | | | | | ☐ | | 2 |
| 8 | | | | | | | ☐ | | 2 |
| 9 | | | | | | | ☐ | | 2 |
| 10 | | | | | | | ☐ | | 2 |

**Wave 1 (5):** Highest scores + most forgiving contacts — shake out bugs.  
**Wave 2 (5):** Next highest — invite after first P0 bugs from Wave 1 fixed.

**Wave 3 (11–25):** Weeks 7–12 — repeat scoring; prefer accounts **similar to Wave 1–2 winners**.

---

## 6. Pre-invite checklist (per customer)

Before sending invite:

- [ ] CRM: customer UUID, ≥1 deal, primary contact email correct  
- [ ] Locations exist (or accept quote limitations)  
- [ ] **Internal smoke:** Login as customer → My Services not empty  
- [ ] First beta task chosen (merchant analysis / quote / renewal review)  
- [ ] Contact briefed: **free beta**, feedback welcome, some features still evolving  
- [ ] **Tech Spend hidden** on prod (recommended)  
- [ ] `NEXT_PUBLIC_PORTAL_INVITES_ENABLED=true`  
- [ ] Assigned **internal owner** (who follows up weekly)

---

## 7. Beta invite talk track (30 seconds)

> “We built CandidIQ — one portal for your services, savings analyses, quotes, and messaging our team. We’re giving **10 clients free early access** while we polish it. We’d love your honest feedback when something’s confusing. Can we schedule 20 minutes, turn on your account, and run a **free [merchant / telecom] analysis** together?”

---

## 8. Expanding from 10 → 25 (days 30–90)

Add customers who match **winning profile** from Wave 1–2:

| Signal from beta | Who to invite next |
|------------------|-------------------|
| Merchant analysis converts | More processing clients with recent statements |
| Quote flow works | Clients with telecom/internet renewal <90 days |
| Message Center heavily used | Clients who email support often today |
| Low login rate | **Don’t** clone that profile — pick more responsive contacts |

**Cap:** ~5 new invites per month so ops can publish deliverables without drowning.

---

## 9. Roles (no “GTM hours” required)

| Role | Who | Does what |
|------|-----|-----------|
| **Beta picker** | Bryan | Final 10 names from scored list |
| **Demo + invite** | Bryan or sales | Call, send portal invite |
| **Fulfillment** | Candid ops | Publish analyses/quotes, Message Center |
| **Bug triage** | Dev | P0 from beta log |
| **Weekly check-in** | Account owner | 5-min “what broke / what helped?” |

---

## 10. Success per customer (not just headcount)

A beta customer “counts” toward healthy 25 if:

- [ ] Logged in **≥2 times** in first 30 days  
- [ ] **≥1** submitted request (analysis, quote, or message)  
- [ ] **≥1** published deliverable received  
- [ ] Provided **≥1** feedback note (call, email, or message)

**25 customers with 15 active** beats 25 with 5 ghost accounts.

---

*Companion: [CandidIQ-GTM-PLAN.md](./CandidIQ-GTM-PLAN.md) · [CandidIQ-BETA-BUG-CHECKLIST.md](./CandidIQ-BETA-BUG-CHECKLIST.md)*
