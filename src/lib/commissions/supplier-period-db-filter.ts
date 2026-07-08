import { periodAfter } from '@/lib/commissions/period-utils';
import type { SupplierTableConfig } from '@/lib/commissions/supplier-config';

/** First day of the commission month (DATE column filter). */
export function commissionMonthStart(period: string): string {
  return `${period}-01`;
}

/** First day of the month after `period` (exclusive end for DATE ranges). */
export function commissionMonthEndExclusive(period: string): string {
  return `${periodAfter(period)}-01`;
}

export function dbPeriodField(config: SupplierTableConfig): string | null {
  if (config.periodFields.includes('period')) return 'period';
  if (config.periodFields.includes('Period')) return 'Period';
  return null;
}

type PeriodQueryable = {
  gte(column: string, value: string): PeriodQueryable;
  lte(column: string, value: string): PeriodQueryable;
  lt(column: string, value: string): PeriodQueryable;
  eq(column: string, value: string): PeriodQueryable;
  in(column: string, values: string[]): PeriodQueryable;
};

/** Apply period filter compatible with text YYYY-MM or Postgres DATE columns. */
export function applyCommissionPeriodDbFilter<T extends PeriodQueryable>(
  query: T,
  config: SupplierTableConfig,
  periods: string[],
): T {
  const periodField = dbPeriodField(config);
  if (!periodField || !periods.length) return query;

  const sorted = [...periods].sort();
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;

  if (config.periodDbFormat === 'date') {
    return query
      .gte(periodField, commissionMonthStart(min))
      .lt(periodField, commissionMonthEndExclusive(max)) as T;
  }

  if (sorted.length === 1) {
    return query.eq(periodField, min) as T;
  }
  return query.gte(periodField, min).lte(periodField, max) as T;
}
