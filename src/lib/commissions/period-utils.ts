/** YYYY-MM period helpers (calendar months, no timezone). */

export function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function periodBefore(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function periodAfter(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Calendar months in the same year through `period` (inclusive), e.g. 2025-06 → Jan–Jun 2025. */
export function periodsInYearThrough(period: string): string[] {
  const year = period.slice(0, 4);
  if (!/^\d{4}-\d{2}$/.test(period)) return [period];
  const endMonth = Number(period.slice(5, 7));
  if (!Number.isFinite(endMonth) || endMonth < 1 || endMonth > 12) return [period];
  const out: string[] = [];
  for (let m = 1; m <= endMonth; m += 1) {
    out.push(`${year}-${String(m).padStart(2, '0')}`);
  }
  return out;
}

/** Periods needed for agent payout rows: current, prior month, and YTD months in the same year. */
export function agentCommissionPeriods(period: string): string[] {
  const prev = periodBefore(period);
  const inYear = periodsInYearThrough(period);
  return [...new Set([period, prev, ...inYear])].sort();
}

/** Bank posting month (YYYY-MM) → commission payout month (deposit arrives ~1 month later). */
export function commissionPeriodFromPostingMonth(postingPeriod: string | null): string | null {
  if (!postingPeriod) return null;
  return periodAfter(postingPeriod);
}
