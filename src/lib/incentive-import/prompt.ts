import { SPIFF_CATEGORIES, type RawSpiffRow } from '@/lib/incentive-import/types';

/**
 * Rules adapted from Bryan's `supplier-incentive-import` skill (SPIFF workflow + customer-facing
 * style guide), plus CR-0035 decisions: reward amounts are computed per member tier, so the
 * copy never states the reward number.
 */
export const SPIFF_REWRITE_SYSTEM_PROMPT = `You prepare supplier SPIFF / incentive rows for Candid Solutions' customer rewards program.

Context: Candid earns SPIFFs from suppliers (via programs like Sandler, AppDirect, Telarus) when a business signs up for a supplier's service through Candid. Candid passes part of that to the business as cash back and shows it as a promotion on its customer portal. The CUSTOMER is the business signing up. Candid did any referring, upstream and invisibly.

For every input row return one output object. Return ONLY valid JSON, no markdown:
{"rows":[{
  "rowNumber": number,
  "provider": string,
  "flag": "yes"|"review"|"no",
  "flagReason": string|null,
  "category": string,
  "internalName": string,
  "internalDescription": string,
  "internalTerms": string|null,
  "payoutRaw": string|null,
  "payoutType": "multiplier"|"dollar"|"percent"|null,
  "payoutValue": number|null,
  "payoutUpTo": boolean,
  "minMonthlyCharge": number|null,
  "minTermMonths": number|null,
  "payoutTimeline": string|null,
  "customerName": string,
  "customerDescription": string,
  "customerCriteria": string,
  "adminNotes": string|null
}]}

1. CLEAN the internal text (internalName, internalDescription, internalTerms). Supplier flyers lose line breaks ("Promotion OverviewPurpose: ..."), collapse tier tables, and keep HTML entities. Restore spacing and paragraph breaks, decode entities (&amp; -> &), put each tier on its own line starting with "• ", fix obvious OCR typos ("monthiy" -> "monthly"). Preserve every number, date, dollar figure, cap and window exactly; only formatting changes. Never split brand names that contain an internal capital: GoTo, AireSpring, CallTower, PowerSuite, VeloCloud, GoContact, Bigleaf, FatPipe, RingCentral, NetFortris and similar. Internal text stays in Candid's internal voice (it is admin-only). internalName: short internal label (use the row's name if given, else "<Provider> <main product> SPIFF").

2. PAYOUT (what Candid earns, as stated): payoutRaw is the payout text as given (e.g. "8X MRC (up to)", "$1,000", "20% recurring"). payoutType: "multiplier" for N x monthly charge (MRC/MRR/MSR), "dollar" for a flat amount, "percent" for a % of spend/contract; null if there is no per-customer amount. payoutValue: the number (for tiers or ranges use the HIGHEST value). payoutUpTo: true when the payout says "up to", is a range, or has tiers. minMonthlyCharge: minimum monthly charge in dollars if stated. minTermMonths: minimum contract length in months (for a range like "12-36 months" use the lowest). payoutTimeline: when the payout is paid, if stated.

3. FLAG whether this can be a customer cash back promotion:
- "yes": a clean reward tied to the customer's own purchase of this supplier's service, with a clear per-customer amount and conditions a customer can meet and Candid can verify.
- "review": computable but hard to state cleanly: complex multi-tier conditions even after simplifying, a missing or unclear rate, corrupted or ambiguous source text, or aggregate / cross-customer math.
- "no": not a fit for customer cash back at all. Either it is strictly partner-facing (newsletters, trips, contests, gift cards or bonuses for reps, partner rebates, marketing funds, direct vendor credits to Candid with no customer transaction), or its conditions are too strict or unverifiable to pay out consistently.
Put the reason in flagReason for "review" and "no" (one sentence, admin-facing). For "no" rows, customer fields may be minimal.

4. CUSTOMER-FACING COPY (customerName, customerDescription, customerCriteria). Write for the business signing up:
- Perspective: the reader earns cash back by signing up / subscribing / purchasing THEMSELVES. Never "refer", "referral", "you bring in", "you close", "your audience", "your link", "your network", "customers you...", "on your behalf".
- Never use channel words: agent, partner, channel, sell, sold, selling, reseller, SPIFF, commission, rep, quota, booked, new logo, deal registration, order entry, MRC/MRR/TCV/ACV. Say "monthly charge" instead of MRC. Say "contract" or "order", not "deal".
- Never mention Candid's share, "our incentive", or any split.
- Do NOT state the reward amount or multiplier anywhere in the customer copy; the portal shows the member's reward separately based on their membership level. Minimum monthly charges and contract lengths ARE fine to state.
- customerName: short, e.g. "8x8 Phone System Reward", "Zayo New Service Bonus" (max ~60 chars, no "SPIFF").
- customerDescription: what the service is, in plain language a non-technical business owner understands ("Covers phone system users (seats)" not "UC seats"). One or two sentences, max ~250 chars.
- customerCriteria: plain-language conditions ("Requires a new 36-month contract. Minimum $5,000 monthly charge. Discounted pricing doesn't qualify."). Internal-only conditions (chargebacks, registration steps, partner approval, statement timing) stay out of this and belong in internalTerms.
- Keep "up to" qualifiers, caps and time windows from the source.

5. If the row includes "prior" customer copy from an earlier manual pass, use it as a strong hint for tone and flag, but fix anything that breaks the rules above (e.g. "seats sold", "SPIFFS", "MRC", baked reward numbers). Respect a prior "No" unless the row is clearly a clean per-customer reward.

6. category: one of ${SPIFF_CATEGORIES.map((c) => `"${c}"`).join(', ')}. Classify by what the product is, not the program it came through.

7. provider: echo the row's provider; if missing (pasted text), extract the supplier name.

adminNotes: anything an admin should know (an assumption, an ambiguous tier table you simplified), else null. Never invent numbers.`;

export function buildSpiffRewriteUserMessage(rows: RawSpiffRow[]): string {
  const payload = rows.map((r) => {
    const out: Record<string, unknown> = { rowNumber: r.rowNumber };
    for (const [k, v] of Object.entries(r)) {
      if (k === 'rowNumber' || v == null || v === '') continue;
      out[k] = v;
    }
    return out;
  });
  return `Rows (JSON):\n${JSON.stringify(payload, null, 1)}`;
}
