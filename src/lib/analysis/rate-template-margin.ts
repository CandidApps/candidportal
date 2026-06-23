import {
  blendedMarkupBps,
  parseScheduleRate,
} from '@/lib/analysis/our-rate-savings';
import {
  resellerRevenueSharePct,
  type MerchantRiskTier,
} from '@/lib/analysis/merchant-risk';
import { fmt$ } from '@/lib/candid-pay/pricingEngine';
import {
  lineAppliesToMarginProduct,
  lineAppliesToRiskTier,
  primaryMarginProduct,
  rateAmountFromLine,
  resolveFeeOccurrence,
  type MarginProductKey,
} from '@/lib/schedule-a-line-metadata';
import {
  isPartnerFeeLine,
  isResellerCompensationSection,
  normalizeScheduleASection,
  type ScheduleARateLine,
} from '@/lib/schedule-a-types';

export type { MarginProductKey };

export type MarginProductAssumption = {
  enabled: boolean;
  monthlyVolume: number;
  monthlyTransactions: number;
};

export type RateTemplateMarginAssumptions = {
  products: Record<MarginProductKey, MarginProductAssumption>;
  /** Merchant risk tier — controls tier-specific Schedule A fees. */
  riskTier: MerchantRiskTier;
};

export const DEFAULT_MARGIN_ASSUMPTIONS: RateTemplateMarginAssumptions = {
  products: {
    cc: { enabled: true, monthlyVolume: 100_000, monthlyTransactions: 500 },
    ach: { enabled: false, monthlyVolume: 0, monthlyTransactions: 0 },
    rdc: { enabled: false, monthlyVolume: 0, monthlyTransactions: 0 },
    pin_debit: { enabled: false, monthlyVolume: 0, monthlyTransactions: 0 },
  },
  riskTier: 'low',
};

export const MARGIN_PRODUCT_LABELS: Record<MarginProductKey, string> = {
  cc: 'Card processing (CC)',
  ach: 'ACH / eCheck',
  rdc: 'RDC (remote deposit)',
  pin_debit: 'PIN debit',
};

export type MarginBreakdownLine = {
  item: string;
  section: string;
  rate: string;
  amount: number;
  unit: 'mo' | 'txn' | 'call' | 'bps' | 'pct' | 'yr';
};

export type MarginCategoryBreakdown = {
  sell: MarginBreakdownLine[];
  buy: MarginBreakdownLine[];
  /** Per-call fees shown for reference but excluded from /txn totals. */
  excludedBuy?: MarginBreakdownLine[];
};

export type MarginCategoryRow = {
  id: MarginProductKey | 'monthly' | 'annual' | 'transaction' | 'volume_bps' | 'card_markup' | 'flat_rate' | 'risk';
  label: string;
  sellSummary: string;
  buySummary: string;
  marginSummary: string;
  marginMonthly: number;
  marginPerTransaction?: number;
  marginBps?: number;
  product?: MarginProductKey;
  breakdown?: MarginCategoryBreakdown;
};

export type RiskProfitabilityRow = {
  tier: MerchantRiskTier;
  label: string;
  revenueSharePct: number;
  grossMarginMonthly: number;
  estimatedNetMonthly: number;
  estimatedNetAnnual: number;
};

export type RateTemplateMarginSummary = {
  categories: MarginCategoryRow[];
  grossMarginMonthly: number;
  riskRows: RiskProfitabilityRow[];
  assumptions: RateTemplateMarginAssumptions;
  hasScheduleA: boolean;
  hasOurRate: boolean;
};

type CardMarkupLine = {
  label: string;
  markupBps: number;
  buyRateLabel: string;
};

type ProductAggregate = {
  monthlyFixed: number;
  annualMonthlyEquiv: number;
  perItemTotal: number;
  volumeBps: number;
  flatRatePct: number | null;
  cardMarkups: CardMarkupLine[];
  breakdown: {
    monthly: MarginBreakdownLine[];
    per_year: MarginBreakdownLine[];
    per_transaction: MarginBreakdownLine[];
    per_call: MarginBreakdownLine[];
    volume_bps: MarginBreakdownLine[];
    card_markup: MarginBreakdownLine[];
    flat_rate: MarginBreakdownLine[];
  };
};

function emptyAggregate(): ProductAggregate {
  return {
    monthlyFixed: 0,
    annualMonthlyEquiv: 0,
    perItemTotal: 0,
    volumeBps: 0,
    flatRatePct: null,
    cardMarkups: [],
    breakdown: {
      monthly: [],
      per_year: [],
      per_transaction: [],
      per_call: [],
      volume_bps: [],
      card_markup: [],
      flat_rate: [],
    },
  };
}

/** Dollar amount treated as the annual fee when occurrence is per_year. */
function annualFeeAmount(
  line: ScheduleARateLine,
  parsed: ReturnType<typeof parseScheduleRate>,
  fallbackAmount: number,
): number {
  if (!parsed) return fallbackAmount;
  if (parsed.kind === 'annual' || parsed.kind === 'monthly' || parsed.kind === 'per_item') {
    return parsed.value;
  }
  return fallbackAmount;
}

function pushBreakdown(
  list: MarginBreakdownLine[],
  line: ScheduleARateLine,
  amount: number,
  unit: MarginBreakdownLine['unit'],
) {
  list.push({
    item: line.item.trim() || 'Line item',
    section: normalizeScheduleASection(line.section),
    rate: line.buyRate,
    amount,
    unit,
  });
}

function lineKey(line: ScheduleARateLine): string {
  return `${normalizeScheduleASection(line.section)}::${line.item.trim().toLowerCase()}`;
}

function skipLine(line: ScheduleARateLine): boolean {
  return isResellerCompensationSection(line.section) || isPartnerFeeLine(line);
}

/** @deprecated Use primaryMarginProduct from schedule-a-line-metadata */
export function classifyScheduleLineProduct(line: ScheduleARateLine): MarginProductKey {
  return primaryMarginProduct(line);
}

function classifyCardFamily(line: ScheduleARateLine): 'vmcd' | 'amex' | 'general' | null {
  const hay = `${line.section} ${line.item} ${line.notes ?? ''}`.toLowerCase();
  if (hay.includes('amex') || hay.includes('american express')) return 'amex';
  if (
    hay.includes('v/mc') ||
    hay.includes('vmc') ||
    hay.includes('visa') ||
    hay.includes('mastercard') ||
    hay.includes('discover') ||
    hay.includes('interchange') ||
    hay.includes('markup') ||
    hay.includes('discount') ||
    line.section === 'Card Processing'
  ) {
    return hay.includes('amex') ? 'amex' : 'general';
  }
  return null;
}

function markupBpsFromLine(line: ScheduleARateLine): number | null {
  const parsed = parseScheduleRate(line.buyRate);
  if (!parsed) return null;
  const item = `${line.section} ${line.item}`.toLowerCase();
  if (parsed.kind === 'bps') return parsed.value;
  if (
    parsed.kind === 'percent' &&
    (item.includes('markup') || item.includes('discount') || item.includes('interchange') || item.includes('plus'))
  ) {
    return Math.round(parsed.value * 100);
  }
  return null;
}

function aggregateProductLines(
  lines: ScheduleARateLine[],
  product: MarginProductKey,
  riskTier: MerchantRiskTier,
): ProductAggregate {
  const agg = emptyAggregate();

  for (const line of lines) {
    if (skipLine(line)) continue;
    if (!lineAppliesToMarginProduct(line, product)) continue;
    if (!lineAppliesToRiskTier(line, riskTier)) continue;

    const occurrence = resolveFeeOccurrence(line);
    const family = product === 'cc' ? classifyCardFamily(line) : null;
    const markupBps = family != null ? markupBpsFromLine(line) : null;

    if (
      occurrence === 'per_volume' &&
      markupBps != null &&
      family &&
      (product === 'cc' || occurrence === 'per_volume')
    ) {
      agg.cardMarkups.push({
        label: line.item.trim() || 'Card processing',
        markupBps,
        buyRateLabel: line.buyRate,
      });
      pushBreakdown(agg.breakdown.card_markup, line, markupBps, 'bps');
      continue;
    }

    const parsed = parseScheduleRate(line.buyRate);
    if (!parsed) continue;

    const amount = rateAmountFromLine(line);
    const item = `${line.section} ${line.item}`.toLowerCase();

    if (occurrence === 'per_occurrence') {
      continue;
    }

    if (occurrence === 'per_call') {
      const callAmount =
        parsed.kind === 'per_item' || parsed.kind === 'monthly' ? parsed.value : amount;
      if (callAmount > 0) {
        pushBreakdown(agg.breakdown.per_call, line, callAmount, 'call');
      }
      continue;
    }

    if (occurrence === 'per_transaction') {
      const txnAmount =
        parsed.kind === 'per_item' || parsed.kind === 'monthly' ? parsed.value : amount;
      if (txnAmount > 0) {
        agg.perItemTotal += txnAmount;
        pushBreakdown(agg.breakdown.per_transaction, line, txnAmount, 'txn');
      }
      continue;
    }

    if (occurrence === 'per_volume') {
      if (parsed.kind === 'bps') {
        agg.volumeBps += parsed.value;
        pushBreakdown(agg.breakdown.volume_bps, line, parsed.value, 'bps');
      } else if (parsed.kind === 'percent' && item.includes('funding')) {
        const bps = parsed.value * 100;
        agg.volumeBps += bps;
        pushBreakdown(agg.breakdown.volume_bps, line, bps, 'bps');
      } else if (parsed.kind === 'percent' && product === 'cc') {
        if (item.includes('flat') || item.includes('blended') || item.includes('discount') || line.section === 'Card Processing') {
          agg.flatRatePct = parsed.value;
          pushBreakdown(agg.breakdown.flat_rate, line, parsed.value, 'pct');
        }
      }
      continue;
    }

    if (occurrence === 'per_month') {
      const monthlyAmount =
        parsed.kind === 'monthly' ? parsed.value : amount > 0 ? amount : 0;
      if (monthlyAmount > 0) {
        agg.monthlyFixed += monthlyAmount;
        pushBreakdown(agg.breakdown.monthly, line, monthlyAmount, 'mo');
      }
      continue;
    }

    if (occurrence === 'per_year') {
      const annualAmount = annualFeeAmount(line, parsed, amount);
      if (annualAmount > 0) {
        const monthlyEquiv = annualAmount / 12;
        agg.annualMonthlyEquiv += monthlyEquiv;
        pushBreakdown(agg.breakdown.per_year, line, annualAmount, 'yr');
      }
      continue;
    }
  }

  return agg;
}

function formatMoneyDelta(value: number, suffix = '/mo'): string {
  const sign = value >= 0 ? '+' : '−';
  return `${sign} ${fmt$(Math.abs(value))}${suffix}`;
}

function formatBpsDelta(value: number): string {
  const sign = value >= 0 ? '+' : '−';
  return `${sign} ${Math.abs(value).toFixed(1)} bps`;
}

function formatPerTxnDelta(value: number): string {
  const sign = value >= 0 ? '+' : '−';
  return `${sign} ${fmt$(Math.abs(value))}/txn`;
}

function breakdownForCategory(
  sell: ProductAggregate,
  buy: ProductAggregate,
  categoryId: MarginCategoryRow['id'],
): MarginCategoryBreakdown | undefined {
  const key =
    categoryId === 'monthly'
      ? 'monthly'
      : categoryId === 'annual'
        ? 'per_year'
      : categoryId === 'transaction'
        ? 'per_transaction'
        : categoryId === 'volume_bps'
          ? 'volume_bps'
        : categoryId === 'card_markup'
          ? 'card_markup'
          : categoryId === 'flat_rate'
            ? 'flat_rate'
            : null;
  if (!key) return undefined;

  const sellLines = sell.breakdown[key];
  const buyLines = buy.breakdown[key];
  const excludedBuy = categoryId === 'transaction' ? buy.breakdown.per_call : undefined;
  if (!sellLines.length && !buyLines.length && !excludedBuy?.length) return undefined;

  return {
    sell: sellLines,
    buy: buyLines,
    ...(excludedBuy?.length ? { excludedBuy } : {}),
  };
}

function calcProductMarginRows(
  product: MarginProductKey,
  sell: ProductAggregate,
  buy: ProductAggregate,
  assumption: MarginProductAssumption,
): { rows: MarginCategoryRow[]; total: number } {
  if (!assumption.enabled) return { rows: [], total: 0 };

  const rows: MarginCategoryRow[] = [];
  let total = 0;
  const label = MARGIN_PRODUCT_LABELS[product];
  const vol = assumption.monthlyVolume;
  const txn = assumption.monthlyTransactions;

  const monthlyMargin = sell.monthlyFixed - buy.monthlyFixed;
  if (sell.monthlyFixed > 0 || buy.monthlyFixed > 0) {
    rows.push({
      id: 'monthly',
      product,
      label: `${label} — monthly fees`,
      sellSummary: fmt$(sell.monthlyFixed) + '/mo',
      buySummary: fmt$(buy.monthlyFixed) + '/mo',
      marginSummary: formatMoneyDelta(monthlyMargin),
      marginMonthly: monthlyMargin,
      breakdown: breakdownForCategory(sell, buy, 'monthly'),
    });
    total += monthlyMargin;
  }

  const annualMargin = sell.annualMonthlyEquiv - buy.annualMonthlyEquiv;
  if (sell.annualMonthlyEquiv > 0 || buy.annualMonthlyEquiv > 0) {
    rows.push({
      id: 'annual',
      product,
      label: `${label} — annual fees`,
      sellSummary:
        sell.annualMonthlyEquiv > 0
          ? `${fmt$(sell.annualMonthlyEquiv)}/mo (${fmt$(sell.annualMonthlyEquiv * 12)}/yr)`
          : '—',
      buySummary:
        buy.annualMonthlyEquiv > 0
          ? `${fmt$(buy.annualMonthlyEquiv)}/mo (${fmt$(buy.annualMonthlyEquiv * 12)}/yr)`
          : '—',
      marginSummary: formatMoneyDelta(annualMargin),
      marginMonthly: annualMargin,
      breakdown: breakdownForCategory(sell, buy, 'annual'),
    });
    total += annualMargin;
  }

  const perItemMargin = sell.perItemTotal - buy.perItemTotal;
  const perItemMonthly = perItemMargin * txn;
  if (sell.perItemTotal > 0 || buy.perItemTotal > 0) {
    rows.push({
      id: 'transaction',
      product,
      label: `${label} — per-item fees`,
      sellSummary: sell.perItemTotal > 0 ? `${fmt$(sell.perItemTotal)}/txn` : '—',
      buySummary: buy.perItemTotal > 0 ? `${fmt$(buy.perItemTotal)}/txn` : '—',
      marginSummary:
        txn > 0
          ? `${formatPerTxnDelta(perItemMargin)} · ${formatMoneyDelta(perItemMonthly)} at ${txn} txn`
          : formatPerTxnDelta(perItemMargin),
      marginMonthly: perItemMonthly,
      marginPerTransaction: perItemMargin,
      breakdown: breakdownForCategory(sell, buy, 'transaction'),
    });
    total += perItemMonthly;
  }

  const volumeBpsMargin = vol * ((sell.volumeBps - buy.volumeBps) / 10000);
  if (sell.volumeBps > 0 || buy.volumeBps > 0) {
    rows.push({
      id: 'volume_bps',
      product,
      label: `${label} — volume (bps)`,
      sellSummary: `${sell.volumeBps.toFixed(1)} bps`,
      buySummary: `${buy.volumeBps.toFixed(1)} bps`,
      marginSummary: `${formatBpsDelta(sell.volumeBps - buy.volumeBps)} · ${formatMoneyDelta(volumeBpsMargin)} at ${fmt$(vol)} vol`,
      marginMonthly: volumeBpsMargin,
      marginBps: sell.volumeBps - buy.volumeBps,
      breakdown: breakdownForCategory(sell, buy, 'volume_bps'),
    });
    total += volumeBpsMargin;
  }

  if (product === 'cc' && (sell.cardMarkups.length || buy.cardMarkups.length)) {
    const sellBps = blendedMarkupBps(
      sell.cardMarkups.map((m, i) => ({
        lineId: `sell-${i}`,
        label: m.label,
        markupBps: m.markupBps,
        buyRateLabel: m.buyRateLabel,
        family: 'general' as const,
      })),
      vol,
    ) ?? 0;
    const buyBps = blendedMarkupBps(
      buy.cardMarkups.map((m, i) => ({
        lineId: `buy-${i}`,
        label: m.label,
        markupBps: m.markupBps,
        buyRateLabel: m.buyRateLabel,
        family: 'general' as const,
      })),
      vol,
    ) ?? 0;
    const spread = sellBps - buyBps;
    const markupMonthly = vol * (spread / 10000);
    const sellLabel =
      sell.cardMarkups.length > 0
        ? sell.cardMarkups.map((m) => `${m.label}: ${m.markupBps} bps`).join(' · ')
        : '—';
    const buyLabel =
      buy.cardMarkups.length > 0
        ? buy.cardMarkups.map((m) => `${m.label}: ${m.markupBps} bps`).join(' · ')
        : '—';
    rows.push({
      id: 'card_markup',
      product,
      label: `${label} — interchange markup`,
      sellSummary: sellLabel,
      buySummary: buyLabel,
      marginSummary: `${formatBpsDelta(spread)} · ${formatMoneyDelta(markupMonthly)} at ${fmt$(vol)} vol`,
      marginMonthly: markupMonthly,
      marginBps: spread,
      breakdown: breakdownForCategory(sell, buy, 'card_markup'),
    });
    total += markupMonthly;
  } else if (product === 'cc' && (sell.flatRatePct != null || buy.flatRatePct != null)) {
    const sellPct = sell.flatRatePct ?? 0;
    const buyPct = buy.flatRatePct ?? 0;
    const flatMonthly = vol * ((sellPct - buyPct) / 100);
    rows.push({
      id: 'flat_rate',
      product,
      label: `${label} — flat / blended rate`,
      sellSummary: sell.flatRatePct != null ? `${sell.flatRatePct.toFixed(2)}%` : '—',
      buySummary: buy.flatRatePct != null ? `${buy.flatRatePct.toFixed(2)}%` : '—',
      marginSummary: formatMoneyDelta(flatMonthly),
      marginMonthly: flatMonthly,
      breakdown: breakdownForCategory(sell, buy, 'flat_rate'),
    });
    total += flatMonthly;
  }

  return { rows, total };
}

function calcGrossMarginForTier(
  ourRateLines: ScheduleARateLine[],
  scheduleALines: ScheduleARateLine[],
  assumptions: RateTemplateMarginAssumptions,
  riskTier: MerchantRiskTier,
): { categories: MarginCategoryRow[]; grossMarginMonthly: number } {
  const categories: MarginCategoryRow[] = [];
  let grossMarginMonthly = 0;
  const productKeys: MarginProductKey[] = ['cc', 'ach', 'rdc', 'pin_debit'];

  for (const product of productKeys) {
    const sell = aggregateProductLines(ourRateLines, product, riskTier);
    const buy = aggregateProductLines(scheduleALines, product, riskTier);
    const { rows, total } = calcProductMarginRows(product, sell, buy, assumptions.products[product]);
    categories.push(...rows);
    grossMarginMonthly += total;
  }

  return { categories, grossMarginMonthly };
}

export function calcRateTemplateMarginSummary(
  ourRateLines: ScheduleARateLine[],
  scheduleALines: ScheduleARateLine[],
  assumptions: RateTemplateMarginAssumptions = DEFAULT_MARGIN_ASSUMPTIONS,
): RateTemplateMarginSummary {
  const { categories, grossMarginMonthly } = calcGrossMarginForTier(
    ourRateLines,
    scheduleALines,
    assumptions,
    assumptions.riskTier,
  );

  const riskTiers: MerchantRiskTier[] = ['low', 'mid', 'high'];
  const riskRows: RiskProfitabilityRow[] = riskTiers.map((tier) => {
    const revenueSharePct = resellerRevenueSharePct(scheduleALines, tier);
    const { grossMarginMonthly: tierGross } = calcGrossMarginForTier(
      ourRateLines,
      scheduleALines,
      assumptions,
      tier,
    );
    const estimatedNetMonthly = tierGross * (revenueSharePct / 100);
    return {
      tier,
      label: tier === 'low' ? 'Low risk' : tier === 'mid' ? 'Mid risk' : 'High risk',
      revenueSharePct,
      grossMarginMonthly: tierGross,
      estimatedNetMonthly,
      estimatedNetAnnual: estimatedNetMonthly * 12,
    };
  });

  return {
    categories,
    grossMarginMonthly,
    riskRows,
    assumptions,
    hasScheduleA: scheduleALines.length > 0,
    hasOurRate: ourRateLines.length > 0,
  };
}

/** Matched line pairs for detailed drill-down (sell vs buy by item name). */
export function matchRateLinePairs(
  ourRateLines: ScheduleARateLine[],
  scheduleALines: ScheduleARateLine[],
): { item: string; section: string; sellRate: string; buyRate: string; marginLabel: string; product: MarginProductKey }[] {
  const buyByKey = new Map<string, ScheduleARateLine>();
  for (const line of scheduleALines) {
    if (skipLine(line)) continue;
    buyByKey.set(lineKey(line), line);
  }

  const pairs: {
    item: string;
    section: string;
    sellRate: string;
    buyRate: string;
    marginLabel: string;
    product: MarginProductKey;
  }[] = [];

  for (const sell of ourRateLines) {
    if (skipLine(sell)) continue;
    const key = lineKey(sell);
    const buy = buyByKey.get(key);
    if (!buy) continue;

    const sellParsed = parseScheduleRate(sell.buyRate);
    const buyParsed = parseScheduleRate(buy.buyRate);
    let marginLabel = '—';
    if (sellParsed && buyParsed) {
      if (sellParsed.kind === 'monthly' && buyParsed.kind === 'monthly') {
        marginLabel = formatMoneyDelta(sellParsed.value - buyParsed.value);
      } else if (sellParsed.kind === 'annual' && buyParsed.kind === 'annual') {
        marginLabel = formatMoneyDelta((sellParsed.value - buyParsed.value) / 12);
      } else if (sellParsed.kind === 'per_item' && buyParsed.kind === 'per_item') {
        marginLabel = formatPerTxnDelta(sellParsed.value - buyParsed.value);
      } else if (sellParsed.kind === 'bps' && buyParsed.kind === 'bps') {
        marginLabel = formatBpsDelta(sellParsed.value - buyParsed.value);
      } else if (sellParsed.kind === 'percent' && buyParsed.kind === 'percent') {
        marginLabel = formatBpsDelta((sellParsed.value - buyParsed.value) * 100);
      }
    }

    pairs.push({
      item: sell.item.trim() || buy.item.trim(),
      section: normalizeScheduleASection(sell.section),
      sellRate: sell.buyRate,
      buyRate: buy.buyRate,
      marginLabel,
      product: primaryMarginProduct(sell),
    });
  }

  return pairs;
}
