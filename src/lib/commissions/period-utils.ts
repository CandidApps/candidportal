/** YYYY-MM period helpers (calendar months, no timezone). */

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

/** Bank posting month (YYYY-MM) → commission payout month (deposit arrives ~1 month later). */
export function commissionPeriodFromPostingMonth(postingPeriod: string | null): string | null {
  if (!postingPeriod) return null;
  return periodAfter(postingPeriod);
}
