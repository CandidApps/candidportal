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
export function proposalSavingsPair(snap: PublishedAnalysisSnapshot): Pair | null {
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

/** @deprecated use proposalSavingsPair */
function fromProposal(snap: PublishedAnalysisSnapshot): Pair | null {
  return proposalSavingsPair(snap);
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

export type RecurringAccountSavings = {
  monthly: number;
  annual: number;
  /** How many managed services contributed when summing from analyses. */
  serviceCount: number;
  /** True when the CRM account savings field was used. */
  fromAccountField: boolean;
};

/**
 * Ongoing / recurring monthly savings for the member dashboard.
 * Prefers the CRM account `savings` field; otherwise sums verified savings on
 * Candid-managed (non-opportunity) services with published analyses.
 */
export function accountRecurringMonthlySavings(
  services: ServiceCardModel[],
  accountSavings?: number | null,
): RecurringAccountSavings {
  const account = Number(accountSavings);
  if (Number.isFinite(account) && account > 0) {
    return {
      monthly: account,
      annual: account * 12,
      serviceCount: 0,
      fromAccountField: true,
    };
  }

  let monthly = 0;
  let serviceCount = 0;
  for (const svc of services) {
    if (!svc.candidManaged || svc.savingsOpportunityOnly || svc.pending) continue;
    if (svc.status === 'inactive' || svc.status === 'external') continue;
    const preview = quoteSavingsPreview(svc);
    if (!preview || preview.monthly <= 0) continue;
    monthly += preview.monthly;
    serviceCount += 1;
  }

  return {
    monthly,
    annual: monthly * 12,
    serviceCount,
    fromAccountField: false,
  };
}
