import type { ServiceCardModel } from '@/lib/services/account-services';
import type { MerchantAnalysisSnapshot } from '@/lib/candid-pay/merchant-analysis';
import type { PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';
import { calcFlat3Savings } from '@/lib/candid-pay/pricingEngine';
import { computeUcaasQuoteFromSnapshot } from '@/lib/ucaas/quote-engine';

export type QuoteSavingsPreview = {
  monthly: number;
  annual: number;
  generatedAt: string | null;
  categoryLabel: string | null;
};

type Pair = { monthly: number; annual: number };

function best(candidates: Pair[]): Pair | null {
  let top: Pair | null = null;
  for (const c of candidates) {
    if (!Number.isFinite(c.monthly) || c.monthly <= 0) continue;
    if (!top || c.monthly > top.monthly) top = c;
  }
  return top;
}

/** Pulls the best available savings figures out of a merchant analysis snapshot. */
function fromMerchant(snap: MerchantAnalysisSnapshot): Pair | null {
  const candidates: Pair[] = [];
  for (const q of snap.providerQuotes ?? []) {
    candidates.push({ monthly: q.monthlySavings, annual: q.annualSavings });
  }
  for (const o of snap.pricingStructureOptions ?? []) {
    candidates.push({ monthly: o.monthlySavings, annual: o.annualSavings });
  }
  const top = best(candidates);
  if (top) return top;

  // Fallback: estimate a flat-3% savings from the parsed statement form.
  const rate = parseFloat(snap.form.currentEffectiveRate) || 0;
  const vol = parseFloat(snap.form.ccVolume) || 0;
  if (rate > 0 && vol > 0) {
    const flat3 = calcFlat3Savings({
      currentEffectiveRate: rate,
      ccVolume: vol,
      currentMonthlyCost: vol * (rate / 100),
    });
    if (flat3.monthlySavings > 0) {
      return { monthly: flat3.monthlySavings, annual: flat3.annualSavings };
    }
  }
  return null;
}

/** Pulls the best available savings figures out of a published proposal snapshot. */
function fromProposal(snap: PublishedAnalysisSnapshot): Pair | null {
  const candidates: Pair[] = [];
  for (const q of snap.providerQuotes ?? []) {
    candidates.push({ monthly: q.monthlySavings, annual: q.annualSavings });
  }
  for (const o of snap.pricingStructureOptions ?? []) {
    candidates.push({ monthly: o.monthlySavings, annual: o.annualSavings });
  }
  if (snap.ucaasQuote) {
    try {
      const totals = computeUcaasQuoteFromSnapshot(snap.ucaasQuote);
      candidates.push({ monthly: totals.monthlySavings, annual: totals.annualSavings });
    } catch {
      // ignore malformed ucaas snapshots
    }
  }
  const top = best(candidates);
  if (top) return top;
  if (snap.merchantAnalysis) return fromMerchant(snap.merchantAnalysis);
  return null;
}

/**
 * Surfaces a savings headline (monthly + annual + generated date) for a completed
 * quote/analysis, so the Quotes view can preview the result the way the old
 * Reports view did. Returns null when no completed analysis is available.
 */
export function quoteSavingsPreview(svc: ServiceCardModel): QuoteSavingsPreview | null {
  if (svc.merchantAnalysis) {
    const pair = fromMerchant(svc.merchantAnalysis);
    return {
      monthly: pair?.monthly ?? 0,
      annual: pair?.annual ?? 0,
      generatedAt: svc.merchantAnalysis.savedAt ?? null,
      categoryLabel: 'Merchant Processing',
    };
  }
  if (svc.analysisSnapshot) {
    const snap = svc.analysisSnapshot;
    const pair = fromProposal(snap);
    return {
      monthly: pair?.monthly ?? 0,
      annual: pair?.annual ?? 0,
      generatedAt: snap.publishedAt ?? null,
      categoryLabel: snap.categoriesLabel ?? snap.categoryLabel ?? null,
    };
  }
  return null;
}

export function formatSavingsMoney(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export function formatGeneratedDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
