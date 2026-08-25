import type { QuoteSavingsPreview } from '@/lib/services/quote-savings';
import { proposalSavingsPair } from '@/lib/services/quote-savings';
import type { PublishedQuoteSnapshot, QuoteRequestItem } from '@/lib/quotes/types';
import type { PricingStructureOption } from '@/lib/analysis/types';
import type { ServiceSavingsBaseline } from '@/lib/services/service-savings';
import { computeUcaasQuoteFromSnapshot, round2 } from '@/lib/ucaas/quote-engine';
import type { PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';

type Pair = { monthly: number; annual: number; oldMonthly?: number; proposedMonthly?: number };

function bestOption(options: PricingStructureOption[] | null | undefined): PricingStructureOption | null {
  if (!options?.length) return null;
  const selected = options.find((o) => o.selected && o.monthlySavings > 0);
  if (selected) return selected;
  let top: PricingStructureOption | null = null;
  for (const o of options) {
    if (!Number.isFinite(o.monthlySavings) || o.monthlySavings <= 0) continue;
    if (!top || o.monthlySavings > top.monthlySavings) top = o;
  }
  return top;
}

function collectQuoteItemOptions(items: QuoteRequestItem[] | undefined): PricingStructureOption[] {
  const out: PricingStructureOption[] = [];
  for (const item of items ?? []) {
    if (item.pricingStructureOptions?.length) out.push(...item.pricingStructureOptions);
  }
  return out;
}

/** Best savings figures from a published customer quote snapshot. */
export function savingsPairFromPublishedQuote(
  snap: PublishedQuoteSnapshot | null | undefined,
): Pair | null {
  if (!snap) return null;

  const topOption =
    bestOption(snap.pricingStructureOptions) ||
    bestOption(collectQuoteItemOptions(snap.quoteItems));
  if (topOption) {
    return {
      monthly: topOption.monthlySavings,
      annual: topOption.annualSavings,
      oldMonthly: topOption.currentMonthlyCost,
      proposedMonthly: topOption.proposedMonthlyCost,
    };
  }

  if (snap.ucaasQuote) {
    try {
      const totals = computeUcaasQuoteFromSnapshot(snap.ucaasQuote);
      if (totals.monthlySavings > 0) {
        return {
          monthly: totals.monthlySavings,
          annual: totals.annualSavings,
          oldMonthly: snap.ucaasQuote.currentMonthlySpend || 0,
          proposedMonthly: totals.monthlyTotal,
        };
      }
    } catch {
      /* ignore */
    }
  }

  return null;
}

/** Build a savings baseline for My Services cards from an accepted published quote. */
export function buildSavingsBaselineFromPublishedQuote(
  snap: PublishedQuoteSnapshot | null | undefined,
  acceptance?: { monthlySavings?: number | null; annualSavings?: number | null } | null,
  capturedAt?: string | null,
): ServiceSavingsBaseline | null {
  if (
    acceptance?.monthlySavings != null &&
    Number.isFinite(acceptance.monthlySavings) &&
    acceptance.monthlySavings > 0
  ) {
    const monthly = acceptance.monthlySavings;
    const annual =
      acceptance.annualSavings != null && acceptance.annualSavings > 0
        ? acceptance.annualSavings
        : monthly * 12;
    const pair = savingsPairFromPublishedQuote(snap);
    return {
      monthlySavings: round2(monthly),
      annualSavings: round2(annual),
      oldMonthly: round2(pair?.oldMonthly ?? 0),
      seatCount: 1,
      candidSeatCount: 1,
      seatItemIds: [],
      capturedAt: capturedAt || snap?.publishedAt || new Date().toISOString(),
    };
  }

  const pair = savingsPairFromPublishedQuote(snap);
  if (!pair || pair.monthly <= 0) return null;
  return {
    monthlySavings: round2(pair.monthly),
    annualSavings: round2(pair.annual),
    oldMonthly: round2(pair.oldMonthly ?? 0),
    seatCount: 1,
    candidSeatCount: 1,
    seatItemIds: [],
    capturedAt: capturedAt || snap?.publishedAt || new Date().toISOString(),
  };
}

export function proposedMonthlyFromPublishedQuote(
  snap: PublishedQuoteSnapshot | null | undefined,
): number | null {
  const pair = savingsPairFromPublishedQuote(snap);
  return pair?.proposedMonthly != null && pair.proposedMonthly > 0 ? pair.proposedMonthly : null;
}

export function savingsPreviewFromAnalysisOrQuote(
  analysis: PublishedAnalysisSnapshot | null | undefined,
  quote: PublishedQuoteSnapshot | null | undefined,
): QuoteSavingsPreview | null {
  if (analysis) {
    const pair = proposalSavingsPair(analysis);
    if (pair && pair.monthly > 0) {
      return {
        monthly: pair.monthly,
        annual: pair.annual,
        generatedAt: analysis.publishedAt ?? null,
        categoryLabel: analysis.categoriesLabel ?? analysis.categoryLabel ?? null,
      };
    }
  }
  const pair = savingsPairFromPublishedQuote(quote);
  if (!pair || pair.monthly <= 0) return null;
  return {
    monthly: pair.monthly,
    annual: pair.annual,
    generatedAt: quote?.publishedAt ?? null,
    categoryLabel: quote?.serviceLabel ?? null,
  };
}
