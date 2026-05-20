# CandidPay Statement Analysis Engine — Cursor Specification

> **Purpose:** This document tells Cursor exactly how the CandidPay Statement Analysis Engine works. Every business rule, pricing decision, fee flag, and data boundary is defined here. Refer to this document when writing, modifying, or debugging any code in this project.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Statement Upload & Parsing](#2-statement-upload--parsing)
3. [Pricing Model Detection](#3-pricing-model-detection)
4. [Pricing Rules by Model](#4-pricing-rules-by-model)
5. [Fee Flags — What to Surface to the Merchant](#5-fee-flags--what-to-surface-to-the-merchant)
6. [MCC Risk Classification](#6-mcc-risk-classification)
7. [Schedule A — Internal Buy Rates](#7-schedule-a--internal-buy-rates)
8. [Internal Profitability Calculation](#8-internal-profitability-calculation)
9. [Customer-Facing vs. Internal Data Rules](#9-customer-facing-vs-internal-data-rules)
10. [Multi-Month Trend Analysis](#10-multi-month-trend-analysis)
11. [Proposal Generation Rules](#11-proposal-generation-rules)
12. [CTA & Contact Capture](#12-cta--contact-capture)
13. [API Route — Statement Parser](#13-api-route--statement-parser)
14. [Key Constants Reference](#14-key-constants-reference)

---

## 1. System Overview

CandidPay is a U.S.-based merchant services provider. This engine allows a CandidPay agent to:

1. **Upload** a merchant's current processor billing statement (PDF)
2. **Auto-parse** it with Claude AI to extract volume, fees, pricing model, and key fee line items
3. **Auto-detect** what pricing model the merchant is currently on (Interchange Plus, Tiered, Flat Rate, etc.)
4. **Apply pricing rules** to generate CandidPay's competing offer
5. **Generate a customer-facing proposal** showing savings in two options (Flat 3% and Dual Pricing)
6. **Calculate internal profitability** for CandidPay management (never shown to customer)
7. **Capture contact information** and schedule a follow-up meeting

**Underlying processors:** CandidPay uses PayCosmos (card processing) and Linked2Pay (ACH/Gateway). These names must **never appear** in any customer-facing output. Everything is branded as CandidPay only.

---

## 2. Statement Upload & Parsing

### Upload Rules
- Accept PDF files only (`.pdf`, MIME type `application/pdf`)
- Accept 1–3 PDF files per upload session (1–3 months of statements)
- Maximum recommended file size: 10MB per file
- If multiple files uploaded, sort chronologically and average numeric fields across all months

### Claude AI Extraction
Each PDF is sent to `/api/parse-statement` (server-side Next.js API route). The route calls `claude-sonnet-4-20250514` with the PDF as a base64 document and returns structured JSON.

**Extracted fields:**

| Field | Type | Description |
|-------|------|-------------|
| `merchantName` | string | Exact business name from statement |
| `statementDate` | string | "MM/YYYY" format |
| `totalVolume` | number | Net sales dollar amount |
| `totalFees` | number | Total charges and fees |
| `transactionCount` | number | Number of transactions |
| `avgTicket` | number | `totalVolume / transactionCount` |
| `cardBreakdown.visa` | number | Visa net sales volume |
| `cardBreakdown.mastercard` | number | Mastercard net sales volume |
| `cardBreakdown.discover` | number | Discover net sales volume |
| `cardBreakdown.amex` | number | American Express net sales volume |
| `feeBreakdown.interchange` | number | True interchange cost (pass-through) |
| `feeBreakdown.processingMarkup` | number | Markup charged above interchange |
| `feeBreakdown.networkFees` | number | Visa/MC/Disc/Amex network assessment fees |
| `feeBreakdown.nonQualSurcharge` | number | Non-qualified volume downgrade penalty |
| `feeBreakdown.authFees` | number | Authorization fees |
| `feeBreakdown.bascStand` | number | BASC STAND — hidden monthly plan fee |
| `feeBreakdown.stmtMail` | number | STMT MAIL — paper statement mailing fee |
| `feeBreakdown.acctFee` | number | ACCT. FEE — monthly account fee |
| `feeBreakdown.otherFixed` | number | Other recurring fixed fees |
| `pricingModel` | enum | See Section 3 |
| `pricingModelEvidence` | string | One-sentence explanation of detection |
| `processingMarkupBps` | number | `processingMarkup / totalVolume * 10000` |
| `effectiveRate` | number | `totalFees / totalVolume * 100` |

### Multi-Statement Averaging
When 2–3 months are uploaded, **average** the following fields across all statements:
- `totalVolume` → `ccVolume` in form
- `transactionCount`
- `effectiveRate`
- `processingMarkupBps`
- `feeBreakdown.bascStand`
- `feeBreakdown.stmtMail`
- `feeBreakdown.nonQualSurcharge`

Use the **most recent statement** for:
- `merchantName`
- `pricingModel` (and `pricingModelEvidence`)
- `statementDate` display (show range: "01/2026 – 03/2026")

---

## 3. Pricing Model Detection

Claude detects the pricing model by analyzing the statement's structure. The detection logic:

### Interchange Plus (`interchange_plus`)
**Indicators:**
- Statement shows an "Interchange" section with itemized interchange rates per card type (e.g., "Interchange - Visa", "Interchange - Mastercard")
- A separate "Processing Fees" section appears below interchange showing markup dollars
- `Total Interchange` and `Total Processing Fees` are listed as separate line items
- This is the most common model for mid-to-large merchants

**Example statement language:** "VS MERCH PRODUCT 1 SIGN PREF... Interchange Rate: 2.1800%... Total Interchange: $197.86... Total Processing Fees: $201.69"

### Tiered (`tiered`)
**Indicators:**
- Statement shows Qualified, Mid-Qualified, and Non-Qualified transaction categories
- Different discount rates for each tier
- Often labeled "QUAL", "MID", "NON-QUAL" or similar

### Flat Rate (`flat_rate`)
**Indicators:**
- Single uniform discount percentage applied to all volume
- No interchange breakdown visible
- All card types charged the same rate
- Often seen with Square, Stripe, or simplified processor statements

### Dual Pricing / Surcharge (`dual_pricing`)
**Indicators:**
- Statement shows "Convenience Fee", "Surcharge", or "Dual Pricing" line items
- Cardholder pays a separate fee on top of the transaction amount
- Merchant's effective rate is near zero or very low on card volume

### Cash Discount (`cash_discount`)
**Indicators:**
- Statement shows credits/adjustments reducing merchant cost
- Merchants post higher prices; cash customers receive a discount
- Net merchant cost is near zero on card transactions

---

## 4. Pricing Rules by Model

### 4a. Interchange Plus — CandidPay Savings Rule

The "fees + processing fees" calculation = all non-interchange charges on the merchant's statement, expressed as basis points on total CC volume. This includes:

**Per-transaction costs (from statement):**
- Transaction fee ($0.0215)
- Authorization fee ($0.03)
- AVS fee ($0.01)
- Batch fee ($0.03)

**Monthly recurring fees (from statement):**
- Account Maintenance ($2.99)
- Online Reporting ($2.95)
- PCI Compliance ($2.53)
- Annual Fee amortized ($1.67/mo)
- 1099K Reporting amortized ($1.25/mo)

**Formula:** `(sum of all non-interchange charges) ÷ monthly CC volume × 10,000 = markup in bps`

**Savings tiers:**

| Current Markup | CandidPay Improvement | New Markup |
|---------------|----------------------|------------|
| < 30 bps | Save 10 bps | Current − 10 bps |
| 31–60 bps | Save 20 bps | Current − 20 bps |
| > 60 bps | Save 30 bps | Current − 30 bps |

Minimum new markup: **5 bps** (never quote below this).

### 4b. Flat Rate — CandidPay Savings Rule

**Maximum improvement:** 30 basis points from current rate  
**Floor rates (never quote below):**
- In-person (card present): **2.5%**
- Online (card not present): **2.8%**

**Formula:**
```
newInPersonRate = max(currentRate - 0.003, 0.025)
newOnlineRate   = max(currentRate - 0.003, 0.028)
blendedNewRate  = (inPersonPct × newInPersonRate) + ((1 - inPersonPct) × newOnlineRate)
```

Requires knowing the merchant's card-present vs. card-not-present volume split. Default to 50/50 if unknown. Always ask for equipment type (POS terminal vs. online gateway).

### 4c. Dual Pricing — CandidPay Competitive Cascade

**Standard new merchant offer:** 3.5% CC (to cardholder) / 1.0% ACH (merchant pays)

**If merchant is already on dual pricing, cascade down:**

| Merchant's Current CC Rate | CandidPay CC Offer | CandidPay ACH Offer |
|--------------------------|---------------------|----------------------|
| Not on dual pricing (new) | 3.5% | 1.0% |
| Currently at 3.5% | 3.25% | 0.75% |
| Currently at 3.25% | 3.0% | 0.50% |
| Currently at 3.0% or below | 3.0% (match) | 0.25% |

**ACH floor:** Never quote ACH below **0.25%** (per transaction percentage).

**ACH is per-transaction percentage** (not a flat per-item fee).

Under dual pricing: merchant's CC processing cost approaches **$0** — the surcharge is collected from the cardholder. Merchant's only cost is ACH volume if they process bank transfers.

### 4d. Always Show Both Options

Regardless of the merchant's current pricing model, **always present two CandidPay options:**
- **Option A — Flat Rate 3.0%:** All-in, no hidden fees, card type irrelevant
- **Option B — Dual Pricing:** CC cost passed to cardholder (3.5% cascade), ACH at floor rate

The pricing model–specific improvement (IC+, Flat Rate) is used to contextualize the savings comparison but both options are always shown.

---

## 5. Fee Flags — What to Surface to the Merchant

These specific fee line items should always be flagged in the customer-facing proposal when found on the statement. They are the most impactful and easiest to explain:

### 🚨 BASC STAND (Base/Standard Plan Fee)
- **What it is:** A hidden monthly "base" or "standard" program fee charged by large national processors regardless of volume
- **Impact:** At $124.99/mo = $1,499.88/yr for a fee that shouldn't exist
- **CandidPay equivalent:** $0 — we do not charge this fee
- **Detection:** Look for "BASC STAND", "BASE STAND", "STANDARD PROGRAM" on statement
- **Flag severity:** 🚨 CRITICAL — always flag

### ⚠️ Non-Qualified Surcharge (OTHR NQ VOL FEE)
- **What it is:** A penalty applied when premium reward cards (Amex, World Elite Mastercard) are processed. These cards "downgrade" to non-qualified status and trigger a surcharge (typically 0.55% of the downgraded volume)
- **Impact:** Often affects 40–60% of volume for merchants whose customers carry premium cards (country clubs, luxury goods, professional services)
- **CandidPay equivalent:** $0 under flat rate or dual pricing — card type is irrelevant
- **Detection:** Look for "OTHR NQ VOL FEE", "NQ VOLUME", "NON-QUALIFIED" on statement
- **Flag severity:** ⚠️ HIGH — always flag if present

### 📮 STMT MAIL (Paper Statement Fee)
- **What it is:** A monthly charge to receive a mailed paper statement
- **Impact:** $20/mo = $240/yr for something that should be free
- **CandidPay equivalent:** $0 — electronic statements included
- **Detection:** Look for "STMT MAIL", "STATEMENT FEE", "PAPER STATEMENT"
- **Flag severity:** 📮 MEDIUM — easy win to mention

### 💳 High Amex Concentration
- **What it is:** Amex charges a higher wholesale rate (typically 2.1%) plus its own processing fee (2.01%), resulting in 4%+ effective rate on Amex volume
- **Flag when:** Amex represents >25% of total volume
- **CandidPay equivalent:** Under dual pricing, Amex cost passes to cardholder. Under flat rate, 3.0% regardless of card type

### 🔄 Excessive Monthly Discount Fee (MDCT MONTH DCNT)
- **What it is:** A monthly discount fee calculated on total volume, often 0.06–0.08%
- **Detection:** "MDCT MONTH DCNT", "MONTHLY DISCOUNT"
- **Flag severity:** LOW — minor but worth noting in context

---

## 6. MCC Risk Classification

MCC (Merchant Category Code) determines CandidPay's risk tier, which directly affects revenue share and BIN monitoring costs.

### Risk Tiers

| Risk | Revenue Share to CandidPay | BIN Monitoring | Monthly Risk Fee |
|------|--------------------------|----------------|-----------------|
| **Low** | 99% | None | $0 |
| **Mid** | 85% | 5 bps on volume | $0 |
| **High** | 65% | 35 bps on volume | $10/mo |

### Classification Rules
- Look up MCC in `MCC_RISK_TABLE` in `lib/pricingEngine.js`
- If MCC is not in the table, **default to Mid Risk**
- Final risk determination is made by the processor's underwriting team after agreement signing — classification here is preliminary
- High Risk MCCs are published in the processor's agent training materials

### Common MCC Examples

**Low Risk:** Restaurants (5812), Gas Stations (5541), Grocery (5411), Retail apparel (5651), Medical (8011/8021), Attorneys (8111), Automotive service (7538)

**Mid Risk:** Travel agencies (4722), Jewelry stores (5944), Country clubs (7997), Online education (8299), Entertainers/bands (7929), Securities brokers (6211)

**High Risk:** Gambling/Lottery (7995), Telemarketing (5966/5967), Casinos (7801), Dating services (7273), Tobacco (5993), Crypto/FX (6051)

---

## 7. Schedule A — Internal Buy Rates

**⚠️ CRITICAL: This data is for CandidPay management only. It must never appear in any customer-facing output, API response, or frontend component visible to merchants or agents.**

### Card Processing Buy Rates (PayCosmos)

**Interchange & Assessments:**
- V/MC/D/EBT: Interchange + 2 bps (volume-based)
- American Express: Interchange + 2 bps (volume-based)

**Processing & Transaction Fees (all Revenue Share: Yes):**
| Fee | Rate | Billing |
|-----|------|---------|
| Transaction | $0.0215 | Per item |
| Authorization | $0.03 | Per item |
| AVS | $0.01 | Per item |
| Batch Fee | $0.03 | Per item (batch) |
| Voice Authorization | $1.24 | Per call |
| PIN Debit | $0.0215 | Per item |
| Chargeback | $20.00 | Per occurrence |
| Retrieval Request | $2.50 | Per occurrence |

**One Time, Monthly & Annual Fees (Revenue Share: Yes):**
| Fee | Rate | Billing |
|-----|------|---------|
| Application Fee | $0.00 | One Time |
| Terminal Download | $0.00 | One Time |
| Equipment Fee | $0.00 | One Time or Monthly |
| Account Maintenance | $2.99 | Monthly |
| Program Fee | $0.00 | Monthly |
| Online Reporting | $2.95 | Monthly |
| PCI Compliance | $2.53 | Monthly |
| Regulatory | $0.00 | Monthly |
| Next Day Funding | $0.00 | Monthly |
| GPRS Terminal (SIM Card) | $50.00 | Monthly |
| 1099K Reporting | $15.00 | Annual |
| Annual Fee | $20.00 | Annual |

**Additional Costs (Revenue Share: NO — CandidPay absorbs these directly):**
| Fee | Rate | Billing |
|-----|------|---------|
| Account on File Open | $0.99 | Monthly |
| Account on File Closed | $0.49 | Monthly |
| Merchant Statements | $0.25 | Monthly |
| Electronic Statements | $0.45 | Monthly |
| Regulatory IRS Reporting | $0.95 | Monthly |
| Excessive Chargebacks | $4.00 | Per occurrence (above threshold) |
| Mid Risk BIN Monitoring | 5 bps | Volume |
| High Risk BIN Monitoring | 35 bps | Volume |
| High Risk Monitoring Fee | $10.00 | Monthly |

### ACH/Gateway Buy Rates (Linked2Pay)

**Monthly (Revenue Share: Yes):**
| Fee | Rate |
|-----|------|
| Gateway Fee Per Client ID | $3.00 |
| ACH Processing Enabled | $5.00 |
| RDC Main Location | $75.00 |
| RDC Next Day Funding | $20.00 |

**ACH Processing (Revenue Share: Yes unless noted):**
| Fee | Rate | Rev Share |
|-----|------|-----------|
| Transaction | $0.10/item | Yes |
| Return | $0.25/item | Yes |
| Unauthorized Return | $7.50/item | Yes |
| Account Verification | $0.30/item | **No** |
| Notice of Change | $0.50/item | **No** |
| Next Day Funding | 10 bps | Yes |

**Miscellaneous (Revenue Share: No):**
| Fee | Rate |
|-----|------|
| Mailed Check | $3.00/item |
| Early Termination | $65.00 one time |
| Add Store Fee | $25.00 one time |

**Standard ACH Limits (flag if merchant exceeds these — requires additional underwriting):**
- Per-item limit: $1,000
- Daily limit: $5,000
- Hard limit: $15,000
- Over-limit items funded in 4 days instead of 2

### Notes on Revenue Share Items
- Items marked "Revenue Share: Yes" — CandidPay receives a percentage of what the merchant pays
- Items marked "Revenue Share: No" — these are direct costs CandidPay absorbs with no recovery
- The "No Revenue Share" items (Account on File, BIN monitoring, excessive chargebacks, early termination, etc.) reduce CandidPay's net margin and must be factored into profitability calculations

---

## 8. Internal Profitability Calculation

**Gate this behind CandidPay management authentication. Never expose to merchant or agent.**

### Formula (Monthly, based on CandidPay Flat 3% proposal)

```
grossRevenue     = ccVolume × 0.03

interchangeCost  = ccVolume × (2 / 10000)         // 2 bps buy rate
perTxnCost       = transactionCount × ($0.0215 + $0.03 + $0.01)
fixedMonthly     = $2.99 + $2.95 + $2.53 + ($20/12) + ($15/12)
binCost          = ccVolume × (binMonitoringBps / 10000)
totalBuyCost     = interchangeCost + perTxnCost + fixedMonthly + binCost + riskMonthlyFee

candidShare      = grossRevenue × revenueShare%    // 99%, 85%, or 65%
ccMargin         = candidShare - totalBuyCost

achGross         = achVolume × 0.01                // estimate 1% ACH rate
achCost          = $3.00 + $5.00 + (achTxnCount × $0.10)
achMargin        = (achGross - achCost) × 0.85     // ACH revenue share is 85%

totalMargin      = ccMargin + max(achMargin, 0)

agentPayout      = totalMargin × agentPct%         // 25%, 50%, or 65%
netProfit        = totalMargin - agentPayout
marginPct        = netProfit / grossRevenue × 100
```

### Agent Compensation Tiers

| Tier | Agent % | Requirements |
|------|---------|--------------|
| **Standard** | 20–30% (use 25% for estimate) | CandidPay handles all operations, onboarding, support |
| **Full-Service** | Up to 50% | Agent handles onboarding, paperwork, verification, equipment shipping/setup, training, ongoing support. Volume: $100K–$1M/mo |
| **Elite Volume** | Up to 65% | Same as Full-Service. Volume: $1M–$10M/mo |

**Hard cap: Agent compensation never exceeds 65% under any standard arrangement.** Exceptions beyond 65% require direct CandidPay leadership approval and are extraordinarily rare. The 65% ceiling exists because CandidPay has significant operational costs (infrastructure, compliance, underwriting, agent support, backend processing) that must be covered.

### Warning Flags (Internal)

Always flag these in the Internal View:
- **High-risk merchant:** 35 bps BIN monitoring + $10/mo significantly reduces margin. Confirm underwriting approval before quoting.
- **ACH volume > $5,000/day:** Exceeds standard limits — additional underwriting required.
- **Net margin < 5%:** Flag for review before proceeding.
- **Negative margin:** Do not proceed without leadership review.

---

## 9. Customer-Facing vs. Internal Data Rules

This table defines what can and cannot appear in customer-facing output:

| Data | Customer-Facing | Internal Only |
|------|----------------|---------------|
| Merchant volume & effective rate | ✅ Show | — |
| CandidPay pricing options (3% flat, dual) | ✅ Show | — |
| Monthly/annual savings | ✅ Show | — |
| Fee flags (BASC STAND, non-qual, STMT MAIL) | ✅ Show | — |
| MCC / industry type | ✅ Show label only | Show risk tier |
| Schedule A buy rates | ❌ Never | ✅ Internal only |
| Risk tier (Low/Mid/High) | ❌ Never | ✅ Internal only |
| Revenue share % | ❌ Never | ✅ Internal only |
| BIN monitoring cost | ❌ Never | ✅ Internal only |
| Agent compensation % or $ | ❌ Never | ✅ Internal only |
| CandidPay net profit | ❌ Never | ✅ Internal only |
| Processor names (PayCosmos, Linked2Pay) | ❌ Never | ✅ Internal reference only |
| "Interchange" as CandidPay's buy rate | ❌ Never | ✅ Internal only |

---

## 10. Multi-Month Trend Analysis

When 2–3 months of statements are uploaded, display a trend analysis panel:

### Trend Table
Show one row per month with columns:
- Statement month (MM/YYYY)
- Monthly volume
- Total fees paid
- Effective rate (color-coded: red > 6%, yellow 4–6%, green < 4%)
- Transaction count
- BASC STAND fee (if present)
- Non-qualified surcharge (if present)
- Detected pricing model

Add a summary row showing 3-month totals and average effective rate.

### Cumulative Overpayment Flags
Calculate across all uploaded months:
- Total BASC STAND paid → "X paid across N months — Y/mo recurring every statement"
- Total STMT MAIL paid → "X paid — $Y/yr annualized"
- Total non-qual surcharges → "X in NQ penalties — premium cards triggering repeated downgrades"
- Flat 3% savings → "If on CandidPay: X saved across N months (Y/mo avg)"

---

## 11. Proposal Generation Rules

### When to Generate
Generate the proposal when the agent clicks "Generate customer proposal" after completing the form.

### Required Fields
- Monthly CC volume (minimum $10,000 — below this, CandidPay may not be a fit)
- Current effective rate
- These two fields are the minimum required; all others enhance accuracy

### Proposal Sections (in order)
1. **Header** — CandidPay logo, merchant name, contact name (if provided), statement period
2. **Pricing Model Callout** — What model the merchant is currently on and why it matters
3. **Current Situation Metrics** — Volume, total fees, effective rate, avg ticket (4 metric cards)
4. **Key Fee Flags** — BASC STAND, non-qual surcharge, STMT MAIL (only show if present)
5. **CandidPay Options** — Option A (Flat 3%) and Option B (Dual Pricing) side by side
6. **Annual Savings Highlight** — Best-case annual savings in a prominent callout
7. **Why CandidPay** — 6 cards (U.S.-based, World-Class Support, Transparent Pricing, Easy Onboarding, No Volume Cap, Finance Team Partner). Do NOT include "Free Statement Analysis" — merchant is already receiving this.
8. **Ready to Move Forward** — Two-option CTA: Option A = scheduling calendar link, Option B = contact form
9. **Footer** — candid.solutions · candidpay.app

### Language Rules
- "Pay" in CandidPay is always italicized: Candid*Pay*
- Never mention Linked2Pay or PayCosmos
- Never use agent-voice language ("makes your job easier") — always merchant-voice
- Do not mention "free statement analysis" as a benefit — merchant already knows
- Use "we" and "you" (CandidPay and merchant) — never "they" or "the merchant"

---

## 12. CTA & Contact Capture

### Contact Name Field
A dedicated "Primary contact name" field separate from the merchant business name. This tells CandidPay who to work with at the organization (e.g., "Sarah Johnson, CFO"). This name:
- Populates "Attn: [Name]" in the proposal header
- Pre-fills the Option B contact form in the CTA
- Is passed to `onCalendarRequest` callback for CRM entry

### Option A — Book Directly
Links to the `calendarLink` prop (must be set to real scheduling URL before go-live).

### Option B — Contact Form (Required fields)
- Full Name *
- Phone *
- Email *
- Preferred Date *
- Preferred Time *
- Notes (optional)

On submit, call `onCalendarRequest({ merchant, contactName, phone, email, date, time, notes })`.

**TODO:** Wire `onCalendarRequest` to your CRM (HubSpot, Salesforce, etc.) and email notification system (Resend, SendGrid, etc.).

---

## 13. API Route — Statement Parser

**File:** `app/api/parse-statement/route.js`

### Request
```
POST /api/parse-statement
Content-Type: application/json
Body: { "pdf": "<base64-encoded PDF string>" }
```

### Response (success)
```json
{ "result": { ...StatementData } }
```

### Response (error)
```json
{ "error": "Statement parsing failed. Please check the PDF and try again." }
```

### Environment Variable Required
```
ANTHROPIC_API_KEY=sk-ant-...
```
Set in `.env.local`. Never commit to source control.

### Model
Always use `claude-sonnet-4-20250514`. Do not use Haiku for this task — accuracy on complex multi-page financial statements requires Sonnet.

### Token Budget
`max_tokens: 1024` is sufficient for the structured JSON response.

---

## 14. Key Constants Reference

### Effective Rate Thresholds (for color coding)
- **> 6.0%** → Red (severely overpaying)
- **4.0–6.0%** → Yellow/warning (overpaying)
- **< 4.0%** → Green (reasonable)

### Volume Thresholds
- **Minimum qualifying volume:** $10,000/mo CC + ACH combined
- **No maximum volume cap** — CandidPay scales with merchant
- **ACH standard item limit:** $1,000 per transaction
- **ACH standard daily limit:** $5,000
- **ACH hard limit:** $15,000 (over this → 4-day funding, needs underwriting)
- **Volume ACH pricing** available for > 100,000 ACH transactions/month

### Savings Display Rules
- Always show **both** flat 3% AND dual pricing savings
- Highlight the **best-case** annual savings prominently
- Show monthly savings first, annual savings second
- If savings are negative (merchant already on better pricing), show "minimal change" — do not show a negative number to the merchant

### Proposal Footer (always include both)
- `candid.solutions`
- `candidpay.app`

### CandidPay Agent Compensation Cap
- **Maximum: 65%** — this is a firm ceiling
- Exceptions only with direct CandidPay leadership approval
- Reason: CandidPay's operational costs (infrastructure, compliance, underwriting, agent support) require this floor

---

*Last updated: May 2026 — CandidPay / Candid Solutions*  
*candid.solutions · candidpay.app*
