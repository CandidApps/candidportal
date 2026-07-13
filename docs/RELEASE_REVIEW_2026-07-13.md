# Production release review — July 13, 2026

**Purpose:** Team checklist for validating processes shipped to live on `main` (`9fbd19b`).  
**Scope:** Today's Candid Portal work plus the Marketing Hub merge from PR #3.  
**Audience:** Ops, account managers, sales ops, eng — anyone who touches quotes, contracts, customers, or customer portal.

Use this as a guided smoke / process review. Mark each item Pass / Fail / Blocked and note who tested and when.

---

## 0) Before functional testing (engineering / ops)

These must be confirmed first or many flows below will look “broken.”

### Database migrations

Confirm **all** of the following are applied on production Supabase:


| Migration                                                  | What it enables                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| `0073_content_marketing_hub.sql`                           | Marketing Hub assets + storage                                            |
| `0074_agent_role_marketing_access.sql`                     | Agent marketing access                                                    |
| `0075_marketing_asset_brands.sql`                          | Marketing asset brands                                                    |
| `20260713160948_bill_analysis_reviews_crm_customer_id.sql` | Analysis review ↔ CRM customer link                                       |
| `20260713165552_account_services_savings_baseline.sql`     | Service savings baseline                                                  |
| `20260713170219_quote_customer_acceptance.sql`             | Customer quote accept fields                                              |
| `20260713171000_assistant_dismissals.sql`                  | My Assistant dismissals                                                   |
| `20260713181000_contract_submit_actions.sql`               | Contract submit actions foundation                                        |
| `20260713190000_customers_linkedin_url.sql`                | Customer LinkedIn URL                                                     |
| `20260713193000_contract_deal_pipeline.sql`                | Deal pipeline stages + activity                                           |
| `20260713194500_contract_provider_id_text.sql`             | Provider id type fix                                                      |
| `20260713200000_contract_action_account_name.sql`          | Account name on contract actions                                          |
| `20260713201500_customer_sentiment_resolve.sql`            | Sentiment resolve                                                         |
| `20260713210000_contract_storage_path.sql`                 | Contract file storage path                                                |


> **Note:** Plaid / Tech Spend was **pulled from production** after this release. Do not test Tech Spend or require `0073_plaid_tech_spend.sql` / Plaid env vars.



### Env / integrations on Vercel (prod)


| Variable / config                                                        | Needed for                                   |
| ------------------------------------------------------------------------ | -------------------------------------------- |
| `ZOHO_TOKEN_ENC_KEY` (existing)                                          | Encrypting Zoho tokens                       |
| Zoho Mail / calendar credentials (existing)                              | Compose, calendar attendees                  |
| Push / VAPID (if already used)                                           | Real admin push notifications                |
| Marketing Hub storage bucket + policies                                  | Upload / serve marketing assets              |




### Deploy check

- [ ] Production deploy finished for commit `9fbd19b` (or later)
- [ ] No critical build/runtime errors in Vercel logs after deploy
- [ ] Hard refresh after deploy (cache / PWA)

---



## 1) Quote → contract deal pipeline (HIGH)

**What changed:** Full contract deal workbench: send contract to supplier, detect reply, reply to supplier, send customer contract, track stages, quote package details.

**Primary surfaces:** Action Center / ticket detail, Contract Deal Workbench, Zoho compose

### Process to review

1. **Customer accepts a quote** (member portal Accept Quote)
2. Admin sees deal enter pipeline (`quote_accepted`)
3. **Submit contract to supplier** (email + stage → `supplier_contract_requested`)
4. **Check for supplier contract reply** / receive contract
5. **Reply to supplier** (logs email; should not jump stages incorrectly)
6. **Send customer contract** → `customer_contract_sent`
7. Mark / reach **customer signed** → `customer_contract_signed`
8. **Convert / close** when appropriate → `converted`
9. Deal timeline / activity log shows steps accurately



### Checklist


| #    | Test                                                                        | Pass? | Notes |
| ---- | --------------------------------------------------------------------------- | ----- | ----- |
| 1.1  | Accept quote as customer (or Login as customer) completes without error     |       |       |
| 1.2  | Admin Action Center shows the deal / ticket after accept                    |       |       |
| 1.3  | Open Contract Deal Workbench; stages render                                 |       |       |
| 1.4  | Submit-to-supplier email opens Zoho compose with correct To/Cc/subject/body |       |       |
| 1.5  | After send, stage updates to supplier requested                             |       |       |
| 1.6  | Check-contract-reply / receive flow finds or accepts contract               |       |       |
| 1.7  | Reply-to-supplier works and **does not** incorrectly advance stage          |       |       |
| 1.8  | Send customer contract updates stage + email logged                         |       |       |
| 1.9  | Quote package / accepted package details show correct pricing & docs        |       |       |
| 1.10 | Pipeline timeline matches what actually happened                            |       |       |


**Owners to involve:** Sales ops, whoever runs supplier contract email today

---



## 2) Customer portal — Tech Spend / Plaid — **REMOVED / DO NOT TEST**

Tech Spend / Plaid was shipped briefly on `9fbd19b` and then **removed from production**. Do not test Connect bank/card or require Plaid env vars.

Still verify (portal preview scoping is independent of Plaid):

| # | Test | Pass? | Notes |
| --- | --- | --- | --- |
| 2.1 | Login as customer works | | |
| 2.2 | Exit customer view restores admin identity in the top bar | | |
| 2.3 | Tech Spend is **not** in the customer sidebar | | |

---

## 3) My Assistant / calendar / push (MEDIUM–HIGH)

**What changed:** Better calendar guest resolution; attendee cache; brief priority count refresh; dismissals; push preference defaults when enabling device / all-types toggle; mentions/assignments can push.

### Process to review


| #   | Test                                                                                  | Pass? | Notes |
| --- | ------------------------------------------------------------------------------------- | ----- | ----- |
| 3.1 | Upcoming meeting in top bar shows guests when invite has attendees                    |       |       |
| 3.2 | Meeting detail stays consistent between top bar and My Assistant week view            |       |       |
| 3.3 | Brief “priorities need attention” count updates when items completed/dismissed        |       |       |
| 3.4 | Dismiss a priority; it stays dismissed after refresh                                  |       |       |
| 3.5 | Enable push on a device → push toggles on for types (or use “Turn on Push for all”)   |       |       |
| 3.6 | Real push fires for a message-center mention / action assignment (not only Test push) |       |       |


**Owners:** Daily My Assistant users

---



## 4) Marketing Hub + email compose (MEDIUM)

**What changed (from merged PR):** Admin Marketing Hub, asset picker in Zoho compose, agent marketing access, HTML marketing assets in compose.

### Process to review


| #   | Test                                                                  | Pass? | Notes |
| --- | --------------------------------------------------------------------- | ----- | ----- |
| 4.1 | Admin sidebar → Marketing Hub opens                                   |       |       |
| 4.2 | Upload an asset (logo / PDF / email template)                         |       |       |
| 4.3 | From compose: “Insert from Marketing Hub” attaches / loads template   |       |       |
| 4.4 | Send via Zoho still works with Cc (contract flows) + marketing assets |       |       |
| 4.5 | Agent role can access marketing features expected by permissions      |       |       |


**Owners:** Marketing + anyone who sends customer/supplier email from portal

---



## 5) Accounts / CRM / leads (MEDIUM)

**What changed:** LinkedIn URL on customers; company address/profile lookup improvements; sentiment resolve path; customer relationship pulse / actions banner updates; leads UX polish; external member services CRM hooks.

### Process to review


| #   | Test                                                              | Pass? | Notes |
| --- | ----------------------------------------------------------------- | ----- | ----- |
| 5.1 | Create / edit account — friendly name, LinkedIn, address lookup   |       |       |
| 5.2 | Open account record — relationship pulse / actions still sensible |       |       |
| 5.3 | Login as customer from account contact still works after exit     |       |       |
| 5.4 | Leads list/detail still load; deal stage fields if shown          |       |       |
| 5.5 | Customer sentiment resolve (if used in Actions) completes         |       |       |


**Owners:** Account team

---



## 6) Member portal — quotes, services, savings (MEDIUM)

**What changed:** Accept quote UI; service request updates; savings baseline; UCaaS/quote proposal accept panels; service detail polish.

### Process to review


| #   | Test                                                          | Pass? | Notes |
| --- | ------------------------------------------------------------- | ----- | ----- |
| 6.1 | My Services loads; logos still show                           |       |       |
| 6.2 | Open a published quote / proposal and Accept                  |       |       |
| 6.3 | Savings / Quotes view still loads opportunities               |       |       |
| 6.4 | Service request from portal creates the expected admin ticket |       |       |
| 6.5 | Upload / pending bill analysis path still reaches My Services |       |       |


**Owners:** Customer success / eng with a sandbox member

---



## 7) Partners — supplier logos (LOW)

**What changed:** Partners → Suppliers & Vendors list + detail show logos (known brands, or website favicon, else initials).

### Process to review


| #   | Test                                                                             | Pass? | Notes |
| --- | -------------------------------------------------------------------------------- | ----- | ----- |
| 7.1 | Partners → Suppliers list shows logos for known vendors (Comcast, Dialpad, etc.) |       |       |
| 7.2 | Supplier with a website shows favicon when not in brand map                      |       |       |
| 7.3 | Supplier detail header shows logo                                                |       |       |


---



## 8) Regression smoke (do not skip)

Quick pass on unrelated but high-traffic paths after this large merge:


| #   | Area                                    | Pass? | Notes |
| --- | --------------------------------------- | ----- | ----- |
| 8.1 | Admin login / member login / magic link |       |       |
| 8.2 | Action Center ticket open/close         |       |       |
| 8.3 | Message Center send + receive           |       |       |
| 8.4 | Commissions / partners navigation       |       |       |
| 8.5 | Mobile nav (icons/text not overlapping) |       |       |
| 8.6 | Global search opens key destinations    |       |       |
| 8.7 | Agent portal (`/agent`) if used by team |       |       |


---



## Suggested test order (½–1 day)

1. **Migrations + env** (Section 0)
2. **Quote accept → contract pipeline** (Section 1) — highest business risk
3. **Login as customer / exit identity** (Section 2)
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

Suggested status labels: **Pass** · **Fail** · **Blocked (missing env/migration)** · **Deferred (sandbox only)**

---



## Commit reference


| Commit            | Description                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `4774284`         | Contract pipeline, calendar/assistant/push, supplier logos, CRM/portal work (also briefly reintroduced Plaid) |
| `e25e319` / PR #3 | Marketing Hub + agent portal access merge                                                       |
| `9fbd19b`         | Merge commit that briefly included Plaid on live                                                |
| _(follow-up)_     | **Remove Plaid / Tech Spend from production again**                                             |


---



## Owners sign-off


| Area                           | Reviewer | Date | Result |
| ------------------------------ | -------- | ---- | ------ |
| Migrations / env               |          |      |        |
| Contract deal pipeline         |          |      |        |
| Login as customer / exit       |          |      |        |
| My Assistant / calendar / push |          |      |        |
| Marketing Hub / compose        |          |      |        |
| Accounts / leads               |          |      |        |
| Member portal quotes/services  |          |      |        |
| Regression smoke               |          |      |        |


