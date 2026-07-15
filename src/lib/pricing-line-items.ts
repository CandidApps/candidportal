import {
  emptyPricingLineItem,
  pricingLineMonthlyTotal,
  type PricingLineItem,
  type ServiceBreakdown,
  type ServiceBreakdownLine,
} from '@/lib/customer-records';

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
    out.push({
      id: typeof r.id === 'string' && r.id.trim() ? r.id : emptyPricingLineItem().id,
      service: service || 'Line item',
      cost: cost ?? 0,
      quantity: quantity ?? 1,
      monthlyTotal,
      includeInMrr,
    });
  }
  return out;
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

export function sumPricingLineItems(items: PricingLineItem[] | undefined): number {
  if (!items?.length) return 0;
  return Math.round(items.reduce((sum, row) => sum + (Number(row.monthlyTotal) || 0), 0) * 100) / 100;
}

/** Sum of monthly totals for rows marked includeInMrr (admin MRR rollup). */
export function sumPricingLineItemsForMrr(items: PricingLineItem[] | undefined): number {
  if (!items?.length) return 0;
  return Math.round(
    items
      .filter((row) => row.includeInMrr !== false)
      .reduce((sum, row) => sum + (Number(row.monthlyTotal) || 0), 0) * 100,
  ) / 100;
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
