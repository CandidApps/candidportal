# Production release review — July 13, 2026

**Purpose:** Team checklist for validating processes shipped to live.  
**Scope:** July 13 portal/admin work + Marketing Hub (PR #3), minus Plaid / Tech Spend (intentionally removed).  
**Audience:** Ops, account managers, sales ops, eng — anyone who touches quotes, contracts, customers, or customer portal.  
**Current `main`:** `2b48a0f` (editable contract links + release review). Plaid / Tech Spend remains removed.

Use this as a guided smoke / process review. Mark each item Pass / Fail / Blocked and note who tested and when.

---

## 0) Before functional testing (engineering / ops)

These must be confirmed first or many flows below will look “broken.”

### Database migrations

Confirm **all** of the following are applied on production Supabase:

| Migration | What it enables |
| --- | --- |
| `0073_content_marketing_hub.sql` | Marketing Hub assets + storage |
| `0074_agent_role_marketing_access.sql` | Agent marketing access |
| `0075_marketing_asset_brands.sql` | Marketing asset brands |
| `20260713160948_bill_analysis_reviews_crm_customer_id.sql` | Analysis review ↔ CRM customer link |
| `20260713165552_account_services_savings_baseline.sql` | Service savings baseline |
| `20260713170219_quote_customer_acceptance.sql` | Customer quote accept fields |
| `20260713171000_assistant_dismissals.sql` | My Assistant dismissals |
| `20260713181000_contract_submit_actions.sql` | Contract submit actions foundation |
| `20260713190000_customers_linkedin_url.sql` | Customer LinkedIn URL |
| `20260713193000_contract_deal_pipeline.sql` | Deal pipeline stages + activity |
| `20260713194500_contract_provider_id_text.sql` | Provider id type fix |
| `20260713200000_contract_action_account_name.sql` | Account name on contract actions |
| `20260713201500_customer_sentiment_resolve.sql` | Sentiment resolve |
| `20260713210000_contract_storage_path.sql` | Contract file storage path |

> **Do not require** `0073_plaid_tech_spend.sql` or Plaid env vars. Tech Spend was removed from production (`a9697eb`). If that migration was already applied, orphaned tables are fine — leave them.

### Env / integrations on Vercel (prod)

| Variable / config | Needed for |
| --- | --- |
| `ZOHO_TOKEN_ENC_KEY` (existing) | Encrypting Zoho tokens |
| Zoho Mail / calendar credentials (existing) | Compose, calendar attendees |
| Push / VAPID (if already used) | Real admin push notifications |
| Marketing Hub storage bucket + policies | Upload / serve marketing assets |

### Deploy check

- [ ] Production deploy finished for **`a9697eb` or later**
- [ ] No critical build/runtime errors in Vercel logs after deploy
- [ ] Hard refresh after deploy (cache / PWA)
- [ ] Customer portal sidebar does **not** show Tech Spend

---

## 1) Quote → contract deal pipeline (HIGH)

**What changed:** Contract deal workbench — submit to supplier, detect/import reply, reply to supplier, send customer contract, stages, quote package details. **Contract link is editable** after auto-import so wrong/outdated URLs can be corrected without changing stage.

**Primary surfaces:** Action Center / ticket detail, Contract Deal Workbench, Zoho compose

### Process to review

1. **Customer accepts a quote** (member portal Accept Quote)
2. Admin sees deal enter pipeline (`quote_accepted`)
3. **Submit contract to supplier** (email + stage → `supplier_contract_requested`)
4. **Check for supplier contract reply** / import contract (pick or paste link)
5. **Edit contract link** if auto-import picked the wrong URL → Save link → Open verifies
6. **Reply to supplier** (logs email; should not jump stages incorrectly)
7. **Send customer contract** (email should use the corrected link) → `customer_contract_sent`
8. Mark / reach **customer signed** → `customer_contract_signed`
9. **Convert / close** when appropriate → `converted`
10. Deal timeline / activity log shows steps (including “Contract link updated” when edited)

### Checklist

| # | Test | Pass? | Notes |
| --- | --- | --- | --- |
| 1.1 | Accept quote as customer (or Login as customer) completes without error | | |
| 1.2 | Admin Action Center shows the deal / ticket after accept | | |
| 1.3 | Open Contract Deal Workbench; stages render | | |
| 1.4 | Submit-to-supplier email opens Zoho compose with correct To/Cc/subject/body | | |
| 1.5 | After send, stage updates to supplier requested | | |
| 1.6 | Check-contract-reply / import finds reply; can choose link or paste URL | | |
| 1.7 | **Editable contract link:** change URL → Save link → persists after refresh | | |
| 1.8 | **Editable contract link** also works on Action Center ticket detail | | |
| 1.9 | Timeline notes “Contract link updated” (or equivalent) after save | | |
| 1.10 | Customer contract email uses the **saved/corrected** link | | |
| 1.11 | Reply-to-supplier works and **does not** incorrectly advance stage | | |
| 1.12 | Send customer contract updates stage + email logged | | |
| 1.13 | Quote package / accepted package details show correct pricing & docs | | |
| 1.14 | Pipeline timeline matches what actually happened | | |

**Owners to involve:** Sales ops, whoever runs supplier contract email today

---

## 2) Customer portal preview (no Tech Spend)

**What changed:** Admin Login as customer / exit identity fixes. Plaid / Tech Spend was **removed** — do not test bank connect.

### Checklist

| # | Test | Pass? | Notes |
| --- | --- | --- | --- |
| 2.1 | Login as customer works | | |
| 2.2 | Exit customer view restores admin identity in the top bar | | |
| 2.3 | Tech Spend is **not** in the customer sidebar or global search | | |
| 2.4 | Customer Dashboard / My Services / Quotes still load under preview | | |

---

## 3) My Assistant / calendar / push (MEDIUM–HIGH)

**What changed:** Better calendar guest resolution; attendee cache; brief priority count refresh; dismissals; push preference defaults when enabling device / all-types toggle; mentions/assignments can push.

### Checklist

| # | Test | Pass? | Notes |
| --- | --- | --- | --- |
| 3.1 | Upcoming meeting in top bar shows guests when invite has attendees | | |
| 3.2 | Meeting detail stays consistent between top bar and My Assistant week view | | |
| 3.3 | Brief “priorities need attention” count updates when items completed/dismissed | | |
| 3.4 | Dismiss a priority; it stays dismissed after refresh | | |
| 3.5 | Enable push on a device → push toggles on for types (or use “Turn on Push for all”) | | |
| 3.6 | Real push fires for a message-center mention / action assignment (not only Test push) | | |

**Owners:** Daily My Assistant users

---

## 4) Marketing Hub + email compose (MEDIUM)

**What changed (from merged PR):** Admin Marketing Hub, asset picker in Zoho compose, agent marketing access, HTML marketing assets in compose (merged with Cc / contract compose).

### Checklist

| # | Test | Pass? | Notes |
| --- | --- | --- | --- |
| 4.1 | Admin sidebar → Marketing Hub opens | | |
| 4.2 | Upload an asset (logo / PDF / email template) | | |
| 4.3 | From compose: “Insert from Marketing Hub” attaches / loads template | | |
| 4.4 | Send via Zoho still works with Cc (contract flows) + marketing assets | | |
| 4.5 | Agent role can access marketing features expected by permissions | | |

**Owners:** Marketing + anyone who sends customer/supplier email from portal

---

## 5) Accounts / CRM / leads (MEDIUM)

**What changed:** LinkedIn URL on customers; company address/profile lookup improvements; sentiment resolve path; customer relationship pulse / actions banner updates; leads UX polish; external member services CRM hooks.

### Checklist

| # | Test | Pass? | Notes |
| --- | --- | --- | --- |
| 5.1 | Create / edit account — friendly name, LinkedIn, address lookup | | |
| 5.2 | Open account record — relationship pulse / actions still sensible | | |
| 5.3 | Login as customer from account contact still works after exit | | |
| 5.4 | Leads list/detail still load; deal stage fields if shown | | |
| 5.5 | Customer sentiment resolve (if used in Actions) completes | | |

**Owners:** Account team

---

## 6) Member portal — quotes, services, savings (MEDIUM)

**What changed:** Accept quote UI; service request updates; savings baseline; UCaaS/quote proposal accept panels; service detail polish.

### Checklist

| # | Test | Pass? | Notes |
| --- | --- | --- | --- |
| 6.1 | My Services loads; logos still show | | |
| 6.2 | Open a published quote / proposal and Accept | | |
| 6.3 | Savings / Quotes view still loads opportunities | | |
| 6.4 | Service request from portal creates the expected admin ticket | | |
| 6.5 | Upload / pending bill analysis path still reaches My Services | | |

**Owners:** Customer success / eng with a sandbox member

---

## 7) Partners — supplier logos (LOW)

**What changed:** Partners → Suppliers & Vendors list + detail show logos (known brands, or website favicon, else initials).

### Checklist

| # | Test | Pass? | Notes |
| --- | --- | --- | --- |
| 7.1 | Partners → Suppliers list shows logos for known vendors (Comcast, Dialpad, etc.) | | |
| 7.2 | Supplier with a website shows favicon when not in brand map | | |
| 7.3 | Supplier detail header shows logo | | |

---

## 8) Regression smoke (do not skip)

| # | Area | Pass? | Notes |
| --- | --- | --- | --- |
| 8.1 | Admin login / member login / magic link | | |
| 8.2 | Action Center ticket open/close | | |
| 8.3 | Message Center send + receive | | |
| 8.4 | Commissions / partners navigation | | |
| 8.5 | Mobile nav (icons/text not overlapping) | | |
| 8.6 | Global search opens key destinations (no Tech Spend) | | |
| 8.7 | Agent portal (`/agent`) if used by team | | |

---

## Suggested test order (½–1 day)

1. **Migrations + env + deploy** (Section 0)
2. **Quote accept → contract pipeline + editable link** (Section 1) — highest business risk
3. **Login as customer / exit + no Tech Spend** (Section 2)
4. **Compose + Marketing Hub** (Section 4) — catch email regressions early
5. **My Assistant / calendar / push** (Section 3)
6. **Accounts / member portal / partners** (Sections 5–7)
7. **Regression smoke** (Section 8)

---

## How to log findings

For each Fail / Blocked item, capture:

- Environment (prod / preview)
- Role used (admin / member / Login as customer / agent)
- Exact steps
- Screenshot or error text
- Whether it blocks go-live use of that process

Suggested status labels: **Pass** · **Fail** · **Blocked (missing env/migration)** · **Deferred**

---

## Commit reference

| Commit | Description |
| --- | --- |
| `4774284` | Contract pipeline, calendar/assistant/push, supplier logos, CRM/portal (also briefly reintroduced Plaid) |
| `e25e319` / PR #3 | Marketing Hub + agent portal access |
| `9fbd19b` | Merge that briefly put Plaid on live |
| `a9697eb` | **Remove Plaid / Tech Spend from production** |
| `2b48a0f` | Editable contract link on deal workbench + ticket detail; release review refresh |

---

## Owners sign-off

| Area | Reviewer | Date | Result |
| --- | --- | --- | --- |
| Migrations / env / deploy | | | |
| Contract deal pipeline + editable link | | | |
| Login as customer / no Tech Spend | | | |
| My Assistant / calendar / push | | | |
| Marketing Hub / compose | | | |
| Accounts / leads | | | |
| Member portal quotes/services | | | |
| Partners logos | | | |
| Regression smoke | | | |
