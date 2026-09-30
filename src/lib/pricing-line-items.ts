import {
  emptyPricingLineItem,
  pricingLineMonthlyTotal,
  type PricingBillingFrequency,
  type PricingChargeType,
  type PricingLineItem,
  type PricingPriceStep,
  type ServiceBreakdown,
  type ServiceBreakdownLine,
} from '@/lib/customer-records';
import {
  BILLING_FREQUENCY_OPTIONS,
  contractTermMonth,
  isOneTimeLine,
  isScheduledLine,
  lineMonthlyAt,
  newPriceStepId,
  recalcPricingLine,
  withContiguousSteps,
} from '@/lib/pricing-schedule';

function isLineItem(value: unknown): value is ServiceBreakdownLine {
  return typeof value === 'object' && value !== null && ('qty' in value || 'subtotal' in value);
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bMrc\b/g, 'MRC')
    .replace(/\bUcaas\b/g, 'UCaaS');
}

/** Normalize unknown AI / form payloads into pricing rows. */
export function normalizePricingLineItems(raw: unknown): PricingLineItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PricingLineItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const service = String(r.service ?? r.name ?? r.product ?? r.label ?? '').trim();
    const cost = num(r.cost ?? r.unitPrice ?? r.unit_price ?? r.rate);
    const quantity = num(r.quantity ?? r.qty ?? r.seats) ?? 1;
    const monthlyExplicit = num(r.monthlyTotal ?? r.monthly_total ?? r.subtotal ?? r.total);
    if (!service && cost == null && monthlyExplicit == null) continue;
    const monthlyTotal =
      monthlyExplicit ?? pricingLineMonthlyTotal(cost ?? 0, quantity ?? 1);
    const includeInMrr =
      typeof r.includeInMrr === 'boolean'
        ? r.includeInMrr
        : typeof r.mrr === 'boolean'
          ? r.mrr
          : true;
    const base: PricingLineItem = {
      id: typeof r.id === 'string' && r.id.trim() ? r.id : emptyPricingLineItem().id,
      service: service || 'Line item',
      cost: cost ?? 0,
      quantity: quantity ?? 1,
      monthlyTotal,
      includeInMrr,
    };
    const chargeType = parseChargeType(r.chargeType ?? r.charge_type);
    const billingFrequency = parseBillingFrequency(r.billingFrequency ?? r.billing_frequency ?? r.frequency);
    const steps = parsePriceSteps(r.priceSteps ?? r.price_steps, r.yearlyPrices ?? r.yearly_prices);
    if (!chargeType && !billingFrequency && !steps) {
      out.push(base);
      continue;
    }
    let line: PricingLineItem = {
      ...base,
      ...(chargeType ? { chargeType } : {}),
      ...(billingFrequency && chargeType !== 'one_time' ? { billingFrequency } : {}),
    };
    if (steps && chargeType !== 'one_time') line = withContiguousSteps(line, steps);
    out.push(isScheduledLine(line) ? recalcPricingLine(line, 1) : line);
  }
  return out;
}

function parseChargeType(v: unknown): PricingChargeType | undefined {
  const s = typeof v === 'string' ? v.toLowerCase().replace(/[\s-]/g, '_') : '';
  if (['one_time', 'onetime', 'setup', 'upfront', 'nrc', 'non_recurring'].includes(s)) return 'one_time';
  if (['recurring', 'mrc', 'subscription'].includes(s)) return 'recurring';
  return undefined;
}

function parseBillingFrequency(v: unknown): PricingBillingFrequency | undefined {
  const s = typeof v === 'string' ? v.toLowerCase().replace(/[\s_-]/g, '') : '';
  if (!s) return undefined;
  const direct = BILLING_FREQUENCY_OPTIONS.find((o) => o.value === s);
  if (direct) return direct.value;
  if (['month', 'mo', 'permonth'].includes(s)) return 'monthly';
  if (['every2months', 'bimonthly', 'bimonth'].includes(s)) return 'bimonthly';
  if (['quarter', 'qtr', 'perquarter'].includes(s)) return 'quarterly';
  if (['semiannually', 'biannual', 'every6months', 'halfyear'].includes(s)) return 'semiannual';
  if (['annually', 'yearly', 'year', 'peryear', 'yr'].includes(s)) return 'annual';
  return undefined;
}

function parsePriceSteps(stepsRaw: unknown, yearlyRaw: unknown): PricingPriceStep[] | undefined {
  if (Array.isArray(stepsRaw) && stepsRaw.length > 1) {
    const steps = stepsRaw
      .map((s) => {
        if (!s || typeof s !== 'object') return null;
        const o = s as Record<string, unknown>;
        const unitPrice = num(o.unitPrice ?? o.unit_price ?? o.price ?? o.cost);
        if (unitPrice == null) return null;
        return {
          id: newPriceStepId(),
          startMonth: num(o.startMonth ?? o.start_month) ?? 1,
          durationMonths: num(o.durationMonths ?? o.duration_months),
          unitPrice,
        } satisfies PricingPriceStep;
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .sort((a, b) => a.startMonth - b.startMonth);
    return steps.length > 1 ? steps : undefined;
  }
  if (Array.isArray(yearlyRaw) && yearlyRaw.length > 1) {
    const prices = yearlyRaw.map(num);
    if (prices.some((p) => p == null)) return undefined;
    return prices.map((p, i) => ({
      id: newPriceStepId(),
      startMonth: i * 12 + 1,
      durationMonths: i === prices.length - 1 ? undefined : 12,
      unitPrice: p as number,
    }));
  }
  return undefined;
}

/** Stored monthly totals refreshed to the current price step (for display / rollups "as of today"). */
export function pricingLineItemsAsOf(
  items: PricingLineItem[],
  contractStartDate: string | undefined | null,
  asOf: Date = new Date(),
): PricingLineItem[] {
  const month = contractTermMonth(contractStartDate, asOf);
  return items.map((l) => (isOneTimeLine(l) || !l.priceSteps?.length ? l : { ...l, monthlyTotal: lineMonthlyAt(l, month) }));
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[$,]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Best-effort conversion of legacy portal serviceBreakdown → pricing table. */
export function pricingLineItemsFromServiceBreakdown(
  breakdown?: ServiceBreakdown | null,
): PricingLineItem[] {
  if (!breakdown) return [];
  const out: PricingLineItem[] = [];
  for (const [key, value] of Object.entries(breakdown)) {
    if (value == null || value === '') continue;
    const label = humanizeKey(key);
    if (typeof value === 'number') {
      out.push({
        ...emptyPricingLineItem(),
        service: label,
        cost: value,
        quantity: 1,
        monthlyTotal: value,
        includeInMrr: true,
      });
    } else if (isLineItem(value)) {
      const quantity = value.qty ?? 1;
      const cost = value.unit_price ?? 0;
      const monthlyTotal = value.subtotal ?? pricingLineMonthlyTotal(cost, quantity);
      out.push({
        ...emptyPricingLineItem(),
        service: label,
        cost,
        quantity,
        monthlyTotal,
        includeInMrr: true,
      });
    }
  }
  return out;
}

/**
 * Monthly (recurring) total. With `termMonth`, stepped / non-monthly lines use that month's price step;
 * without it, the stored monthly totals. One-time lines never count.
 */
export function sumPricingLineItems(items: PricingLineItem[] | undefined, termMonth?: number): number {
  if (!items?.length) return 0;
  return Math.round(items.reduce((sum, row) => sum + rowMonthly(row, termMonth), 0) * 100) / 100;
}

/** Sum of monthly totals for rows marked includeInMrr (admin MRR rollup). One-time lines never count. */
export function sumPricingLineItemsForMrr(items: PricingLineItem[] | undefined, termMonth?: number): number {
  if (!items?.length) return 0;
  return Math.round(
    items
      .filter((row) => row.includeInMrr !== false)
      .reduce((sum, row) => sum + rowMonthly(row, termMonth), 0) * 100,
  ) / 100;
}

function rowMonthly(row: PricingLineItem, termMonth: number | undefined): number {
  if (isOneTimeLine(row)) return 0;
  if (termMonth != null) return lineMonthlyAt(row, termMonth);
  return Number(row.monthlyTotal) || 0;
}

/** Estimated total with tax from MRC and tax rate percent. */
export function estimatedTotalFromTax(mrc: number, taxRatePercent: number): number {
  if (!Number.isFinite(mrc) || mrc < 0) return 0;
  if (!Number.isFinite(taxRatePercent)) return Math.round(mrc * 100) / 100;
  return Math.round(mrc * (1 + taxRatePercent / 100) * 100) / 100;
}

export function taxAmountFromRate(mrc: number, taxRatePercent: number): number {
  if (!Number.isFinite(mrc) || !Number.isFinite(taxRatePercent)) return 0;
  return Math.round(mrc * (taxRatePercent / 100) * 100) / 100;
}

/**
 * Evaluate a simple arithmetic expression for SPIFF (e.g. "100x5", "50*12", "200+25").
 * Supports + - * / × x and parentheses. Returns null if invalid.
 */
export function evaluateSimpleMathExpression(raw: string): number | null {
  const trimmed = raw.trim().replace(/\$/g, '').replace(/,/g, '');
  if (!trimmed) return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  let expr = trimmed.replace(/[x×]/gi, '*').replace(/÷/g, '/');
  if (!/^[\d.\s+\-*/()]+$/.test(expr)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr});`)() as unknown;
    return typeof result === 'number' && Number.isFinite(result) ? Math.round(result * 100) / 100 : null;
  } catch {
    return null;
  }
}

export function formatMoney(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
