import type { BillParseResult } from '@/lib/bill-parse-types';
import type { MerchantStatementForm } from '@/lib/candid-pay/merchant-analysis';
import type { StatementData } from '@/lib/candid-pay/statementParser';
import {
  applicableRiskFeeLines,
  estimateCandidBuyCost,
  estimateMonthlyCommission,
  resellerRevenueSharePct,
  riskTierFromMcc,
  type MerchantRiskTier,
} from '@/lib/analysis/merchant-risk';
import { calcAllProviderQuotes, calcProviderSavingsQuotes } from '@/lib/analysis/our-rate-savings';
import type { MerchantAnalysisProvider, MerchantProviderSelection, ProviderSavingsQuote } from '@/lib/analysis/types';

const PROCESSOR_ALIASES: Record<string, RegExp> = {
  linked2pay: /linked\s*2\s*pay|linked2pay|l2p|candid\s*pay/i,
  nuvei: /nuvei|payment\s*cloud|paymentcloud|ncp|network\s*merchants/i,
  square: /square/i,
  stripe: /stripe/i,
  worldpay: /worldpay|fiserv/i,
  elavon: /elavon/i,
  clover: /clover/i,
};

function vendorHints(parseResult: BillParseResult, vendorName: string): string[] {
  return [
    vendorName,
    parseResult.vendorName ?? '',
    parseResult.serviceName ?? '',
    parseResult.merchantStatement?.merchantName ?? '',
  ].filter(Boolean);
}

export function customerAlreadyWithProvider(
  provider: MerchantAnalysisProvider,
  hints: string[],
): boolean {
  const slug = provider.id.toLowerCase();
  const names = [provider.name, provider.displayName ?? '', slug].map((n) => n.toLowerCase());

  for (const hint of hints) {
    const h = hint.trim();
    if (!h) continue;
    const hl = h.toLowerCase();
    for (const n of names) {
      if (n && hl.includes(n.replace(/\s+/g, ''))) return true;
      if (n && n.length > 3 && hl.includes(n)) return true;
    }
    const alias = PROCESSOR_ALIASES[slug];
    if (alias?.test(h)) return true;
  }
  return false;
}

function estimateProviderCommission(
  provider: MerchantAnalysisProvider,
  quote: ProviderSavingsQuote,
  form: MerchantStatementForm,
  risk: MerchantRiskTier,
): number {
  return estimateMonthlyCommission(quote.proposedMonthlyCost, form, provider.lines, risk);
}

type ScoredProvider = {
  provider: MerchantAnalysisProvider;
  quote: ProviderSavingsQuote | null;
  monthlySavings: number;
  estimatedCommission: number;
  combinedScore: number;
  revenueSharePct: number;
  excluded: boolean;
  exclusionReason?: string;
};

function scoreProviders(
  providers: MerchantAnalysisProvider[],
  form: MerchantStatementForm,
  statements: StatementData[],
  risk: MerchantRiskTier,
  hints: string[],
): ScoredProvider[] {
  const quotes = calcAllProviderQuotes(providers, form, statements);
  const quoteById = new Map(quotes.map((q) => [q.providerId, q]));

  return providers.map((provider) => {
    if (customerAlreadyWithProvider(provider, hints)) {
      return {
        provider,
        quote: quoteById.get(provider.id) ?? null,
        monthlySavings: 0,
        estimatedCommission: 0,
        combinedScore: -1,
        revenueSharePct: 0,
        excluded: true,
        exclusionReason: 'Customer appears to already be on this processor',
      };
    }

    const quote = quoteById.get(provider.id) ?? null;
    const monthlySavings = quote?.monthlySavings ?? 0;
    const estimatedCommission = quote
      ? estimateProviderCommission(provider, quote, form, risk)
      : 0;
    const combinedScore = monthlySavings + estimatedCommission;

    return {
      provider,
      quote,
      monthlySavings,
      estimatedCommission,
      combinedScore,
      revenueSharePct: resellerRevenueSharePct(provider.lines, risk),
      excluded: false,
    };
  });
}

function pickBest(scored: ScoredProvider[]): ScoredProvider | null {
  const eligible = scored.filter((s) => !s.excluded);
  if (!eligible.length) return null;

  eligible.sort((a, b) => b.combinedScore - a.combinedScore);
  const top = eligible[0]!;
  const linked2pay = eligible.find((s) => s.provider.id === 'linked2pay');

  if (linked2pay && top.combinedScore > 0) {
    if (linked2pay.combinedScore >= top.combinedScore * 0.92) {
      return linked2pay;
    }
  }

  if (top.combinedScore <= 0 && linked2pay) {
    return linked2pay;
  }

  return top;
}

export function selectBestMerchantProvider(
  providers: MerchantAnalysisProvider[],
  parseResult: BillParseResult,
  vendorName: string,
  mccCode?: string | null,
): {
  selection: MerchantProviderSelection | null;
  providerQuotes: ProviderSavingsQuote[];
  ourRateLines: MerchantAnalysisProvider['lines'];
} {
  if (!providers.length || !parseResult.merchantStatement) {
    return { selection: null, providerQuotes: [], ourRateLines: [] };
  }

  const merchantAnalysis = parseResult.merchantStatement;
  const form: MerchantStatementForm = {
    merchantName: merchantAnalysis.merchantName,
    mcc: mccCode?.trim() ?? '',
    statementPeriod: merchantAnalysis.statementDate,
    contactName: '',
    contactTitle: '',
    contactEmail: '',
    contactPhone: '',
    ccVolume: String(merchantAnalysis.totalVolume ?? 0),
    achVolume: '0',
    transactionCount: String(merchantAnalysis.transactionCount ?? 0),
    currentEffectiveRate: String(merchantAnalysis.effectiveRate ?? 0),
    pricingModel: merchantAnalysis.pricingModel,
    currentMarkupBps: String(merchantAnalysis.processingMarkupBps ?? 0),
    cardPresentPct: '70',
    equipment: '',
    currentCCRate: '',
    currentACHRate: '',
    bascStand: String(merchantAnalysis.feeBreakdown?.bascStand ?? 0),
    stmtMail: String(merchantAnalysis.feeBreakdown?.stmtMail ?? 0),
    nonQualFee: String(merchantAnalysis.feeBreakdown?.nonQualSurcharge ?? 0),
    agentName: '',
    agentTier: 'standard',
  };

  const statements = [parseResult.merchantStatement];
  const hints = vendorHints(parseResult, vendorName);
  const { tier, mccCode: mcc, label } = riskTierFromMcc(mccCode ?? form.mcc);
  const scored = scoreProviders(providers, form, statements, tier, hints);
  const providerQuotes = calcProviderSavingsQuotes(providers, form, statements);
  const best = pickBest(scored);

  if (!best) {
    const fallback = providers.find((p) => p.id === 'linked2pay') ?? providers[0];
    return {
      selection: fallback
        ? {
            providerId: fallback.id,
            providerName: fallback.displayName ?? fallback.name,
            reason: 'Defaulted — no eligible partner after exclusions.',
            riskTier: tier,
            mccCode: mcc || undefined,
            mccLabel: label,
            revenueSharePct: resellerRevenueSharePct(fallback.lines, tier),
            monthlySavings: 0,
            estimatedMonthlyCommission: 0,
            excludedProviders: scored
              .filter((s) => s.excluded)
              .map((s) => ({
                id: s.provider.id,
                name: s.provider.displayName ?? s.provider.name,
                reason: s.exclusionReason ?? 'Excluded',
              })),
            applicableRiskFees: applicableRiskFeeLines(fallback.lines, tier).map((l) => l.item),
          }
        : null,
      providerQuotes,
      ourRateLines: fallback?.lines ?? [],
    };
  }

  const savingsNote =
    best.monthlySavings > 0
      ? `Est. savings ${best.monthlySavings.toFixed(0)}/mo`
      : 'Savings estimate pending rate match';
  const commissionNote = `Est. commission $${best.estimatedCommission.toFixed(0)}/mo`;
  const riskNote = `${tier === 'low' ? 'Low' : tier === 'mid' ? 'Mid' : 'High'} risk (MCC ${mcc || 'n/a'}) · ${best.revenueSharePct}% revenue share`;

  return {
    selection: {
      providerId: best.provider.id,
      providerName: best.provider.displayName ?? best.provider.name,
      reason: `${best.provider.displayName ?? best.provider.name} selected — ${savingsNote}; ${commissionNote}. ${riskNote}.`,
      riskTier: tier,
      mccCode: mcc || undefined,
      mccLabel: label,
      revenueSharePct: best.revenueSharePct,
      monthlySavings: best.monthlySavings,
      estimatedMonthlyCommission: best.estimatedCommission,
      excludedProviders: scored
        .filter((s) => s.excluded)
        .map((s) => ({
          id: s.provider.id,
          name: s.provider.displayName ?? s.provider.name,
          reason: s.exclusionReason ?? 'Excluded',
        })),
      applicableRiskFees: applicableRiskFeeLines(best.provider.lines, tier).map((l) => l.item),
    },
    providerQuotes,
    ourRateLines: best.provider.lines,
  };
}
