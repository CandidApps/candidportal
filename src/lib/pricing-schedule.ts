import type {
  PricingBillingFrequency,
  PricingLineItem,
  PricingPriceStep,
} from '@/lib/customer-records';

export const BILLING_FREQUENCY_OPTIONS: { value: PricingBillingFrequency; label: string; months: number }[] = [
  { value: 'monthly', label: 'Monthly', months: 1 },
  { value: 'bimonthly', label: 'Every 2 months', months: 2 },
  { value: 'quarterly', label: 'Quarterly', months: 3 },
  { value: 'semiannual', label: 'Semi-annual', months: 6 },
  { value: 'annual', label: 'Annual', months: 12 },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

export function monthsPerBillingPeriod(freq: PricingBillingFrequency | undefined): number {
  return BILLING_FREQUENCY_OPTIONS.find((o) => o.value === freq)?.months ?? 1;
}

export function billingFrequencyLabel(freq: PricingBillingFrequency | undefined): string {
  return BILLING_FREQUENCY_OPTIONS.find((o) => o.value === freq)?.label ?? 'Monthly';
}

export function isOneTimeLine(line: PricingLineItem): boolean {
  return line.chargeType === 'one_time';
}

/** Lines whose monthly amount is derived (not the legacy cost × qty / manual override). */
export function isScheduledLine(line: PricingLineItem): boolean {
  return (
    isOneTimeLine(line) ||
    (line.billingFrequency != null && line.billingFrequency !== 'monthly') ||
    (line.priceSteps?.length ?? 0) > 1
  );
}

export function newPriceStepId(): string {
  return `pstep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Steps sorted by start; a line without steps has one step at the base cost for the whole term. */
export function normalizedPriceSteps(line: PricingLineItem): PricingPriceStep[] {
  if (line.priceSteps?.length) {
    return [...line.priceSteps].sort((a, b) => a.startMonth - b.startMonth);
  }
  return [{ id: 'base', startMonth: 1, unitPrice: line.cost }];
}

export function priceStepAtMonth(line: PricingLineItem, month: number): PricingPriceStep | null {
  const steps = normalizedPriceSteps(line);
  let current: PricingPriceStep | null = null;
  for (const step of steps) {
    if (step.startMonth <= month) current = step;
  }
  if (!current) return steps[0] ?? null;
  const isLast = current === steps[steps.length - 1];
  if (isLast && current.durationMonths && month >= current.startMonth + current.durationMonths) return null;
  return current;
}

/** Normalized monthly amount (before tax) for a given 1-based contract month. */
export function lineMonthlyAt(line: PricingLineItem, month: number): number {
  if (isOneTimeLine(line)) return 0;
  if (!isScheduledLine(line)) return Number(line.monthlyTotal) || 0;
  const step = priceStepAtMonth(line, month);
  if (!step) return 0;
  const qty = Number.isFinite(line.quantity) ? line.quantity : 0;
  return round2((step.unitPrice * qty) / monthsPerBillingPeriod(line.billingFrequency));
}

export function lineOneTimeTotal(line: PricingLineItem): number {
  if (!isOneTimeLine(line)) return 0;
  const qty = Number.isFinite(line.quantity) ? line.quantity : 0;
  return round2((Number(line.cost) || 0) * qty);
}

function parseDate(raw: string | undefined | null): Date | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 1-based month of the term that `asOf` falls in; 1 when the start date is unknown or in the future. */
export function contractTermMonth(contractStartDate: string | undefined | null, asOf: Date = new Date()): number {
  const start = parseDate(contractStartDate);
  if (!start) return 1;
  let months = (asOf.getFullYear() - start.getFullYear()) * 12 + (asOf.getMonth() - start.getMonth());
  if (asOf.getDate() < start.getDate()) months -= 1;
  return Math.max(1, months + 1);
}

/** Whole months between start and end dates, or null when either is missing. */
export function contractTermMonths(
  contractStartDate: string | undefined | null,
  contractEndDate: string | undefined | null,
): number | null {
  const start = parseDate(contractStartDate);
  const end = parseDate(contractEndDate);
  if (!start || !end || end <= start) return null;
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() > start.getDate()) months += 1;
  return Math.max(1, months);
}

/** Recompute the stored monthly total for the current term month after an edit. */
export function recalcPricingLine(line: PricingLineItem, termMonth: number): PricingLineItem {
  if (isOneTimeLine(line)) return { ...line, monthlyTotal: 0, includeInMrr: false };
  if (!isScheduledLine(line)) {
    const qty = Number.isFinite(line.quantity) ? line.quantity : 0;
    return { ...line, monthlyTotal: round2((Number(line.cost) || 0) * qty) };
  }
  return { ...line, monthlyTotal: lineMonthlyAt(line, termMonth) };
}

/** Keeps steps contiguous: each step starts where the previous one's duration ends; step 1 mirrors `cost`. */
export function withContiguousSteps(line: PricingLineItem, steps: PricingPriceStep[]): PricingLineItem {
  if (steps.length <= 1) {
    const only = steps[0];
    return { ...line, cost: only ? only.unitPrice : line.cost, priceSteps: undefined };
  }
  let start = 1;
  const next = steps.map((s, i) => {
    const step = { ...s, startMonth: start };
    const isLast = i === steps.length - 1;
    const dur = s.durationMonths && s.durationMonths > 0 ? s.durationMonths : isLast ? undefined : 12;
    step.durationMonths = dur;
    if (dur) start += dur;
    return step;
  });
  return { ...line, cost: next[0].unitPrice, priceSteps: next };
}

/** Preset: one 12-month step per contract year, keeping any prices already entered for those months. */
export function splitStepsByYear(line: PricingLineItem, years: number): PricingLineItem {
  const count = Math.max(2, Math.min(10, Math.round(years)));
  const steps: PricingPriceStep[] = Array.from({ length: count }, (_, i) => {
    const startMonth = i * 12 + 1;
    const existing = priceStepAtMonth(line, startMonth);
    return {
      id: newPriceStepId(),
      startMonth,
      durationMonths: i === count - 1 ? undefined : 12,
      unitPrice: existing?.unitPrice ?? line.cost,
    };
  });
  return withContiguousSteps(line, steps);
}

export type PricingScheduleSummary = {
  termMonths: number | null;
  currentMonth: number;
  currentMonthly: number;
  currentMrr: number;
  oneTimeTotal: number;
  years: { year: number; total: number }[];
  /** Null when the term length is unknown (no start/end dates). */
  tcv: number | null;
};

export function summarizePricingSchedule(
  items: PricingLineItem[],
  opts: { contractStartDate?: string; contractEndDate?: string; asOf?: Date },
): PricingScheduleSummary {
  const termMonths = contractTermMonths(opts.contractStartDate, opts.contractEndDate);
  const currentMonth = contractTermMonth(opts.contractStartDate, opts.asOf);
  const stepHorizon = items.reduce((max, line) => {
    const steps = normalizedPriceSteps(line);
    const last = steps[steps.length - 1];
    return Math.max(max, last.startMonth + (last.durationMonths ?? 12) - 1);
  }, 12);
  const horizon = termMonths ?? stepHorizon;
  const oneTimeTotal = round2(items.reduce((s, l) => s + lineOneTimeTotal(l), 0));

  const years: { year: number; total: number }[] = [];
  let recurringTotal = 0;
  for (let y = 1; y <= Math.ceil(horizon / 12); y++) {
    let total = y === 1 ? oneTimeTotal : 0;
    for (let m = (y - 1) * 12 + 1; m <= Math.min(y * 12, horizon); m++) {
      const monthSum = items.reduce((s, l) => s + lineMonthlyAt(l, m), 0);
      total += monthSum;
      recurringTotal += monthSum;
    }
    years.push({ year: y, total: round2(total) });
  }

  const currentMonthly = round2(items.reduce((s, l) => s + lineMonthlyAt(l, currentMonth), 0));
  const currentMrr = round2(
    items.filter((l) => l.includeInMrr !== false).reduce((s, l) => s + lineMonthlyAt(l, currentMonth), 0),
  );

  return {
    termMonths,
    currentMonth,
    currentMonthly,
    currentMrr,
    oneTimeTotal,
    years,
    tcv: termMonths != null ? round2(recurringTotal + oneTimeTotal) : null,
  };
}
