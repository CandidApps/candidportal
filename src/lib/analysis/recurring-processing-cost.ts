import type { MerchantStatementForm } from '@/lib/candid-pay/merchant-analysis';
import type { StatementData } from '@/lib/candid-pay/statementParser';
import { sortStatements } from '@/lib/candid-pay/statementParser';

const RECURRING_FEE_KEYS = [
  'interchange',
  'processingMarkup',
  'networkFees',
  'nonQualSurcharge',
  'authFees',
  'bascStand',
  'stmtMail',
  'acctFee',
] as const satisfies readonly (keyof StatementData['feeBreakdown'])[];

export type RecurringCostBasis = {
  /** Recurring card processing cost (excludes chargebacks, retrievals, and other one-offs). */
  recurringCardMonthly: number;
  /** Non-recurring fees removed from the savings baseline. */
  excludedOneOffMonthly: number;
  /** Raw average statement total for reference. */
  statementTotalMonthly: number;
  /** Recurring effective rate = recurringCardMonthly / volume (%). */
  recurringEffectiveRate: number;
  transactionCount: number;
  volume: number;
};

function avgOverStatements(
  statements: StatementData[],
  fn: (s: StatementData) => number,
): number {
  if (!statements.length) return 0;
  return statements.reduce((acc, s) => acc + fn(s), 0) / statements.length;
}

function medianMonthlyTotals(statements: StatementData[]): number {
  const totals = statements.map((s) => s.totalFees ?? 0).filter((t) => t > 0).sort((a, b) => a - b);
  if (!totals.length) return 0;
  const mid = Math.floor(totals.length / 2);
  return totals.length % 2 === 1 ? totals[mid]! : (totals[mid - 1]! + totals[mid]!) / 2;
}

function hasMeaningfulBreakdown(stmt: StatementData): boolean {
  const fb = stmt.feeBreakdown;
  if (!fb) return false;
  return RECURRING_FEE_KEYS.some((k) => (fb[k] ?? 0) > 0) || (fb.otherFixed ?? 0) > 0;
}

function recurringFromBreakdown(stmt: StatementData): number {
  const fb = stmt.feeBreakdown;
  if (!fb) return stmt.totalFees ?? 0;
  return RECURRING_FEE_KEYS.reduce((sum, key) => sum + (fb[key] ?? 0), 0);
}

/**
 * Baseline monthly card cost for savings comparisons.
 * Excludes `otherFixed` (chargebacks, retrievals, PCI penalties, one-offs).
 * With multiple statements, uses median total when breakdown is missing to dampen spikes.
 */
export function resolveRecurringCostBasis(
  form: MerchantStatementForm,
  statements?: StatementData[],
): RecurringCostBasis {
  const sorted = statements?.length ? sortStatements(statements) : [];
  const stmt = sorted[sorted.length - 1];

  const volume = parseFloat(form.ccVolume) || avgOverStatements(sorted, (s) => s.totalVolume) || 0;
  const transactionCount =
    parseFloat(form.transactionCount) ||
    avgOverStatements(sorted, (s) => s.transactionCount) ||
    Math.max(1, Math.round(volume / 75));

  let recurringCardMonthly: number;
  let excludedOneOffMonthly: number;
  let statementTotalMonthly: number;

  if (sorted.length > 0 && sorted.some(hasMeaningfulBreakdown)) {
    recurringCardMonthly = avgOverStatements(sorted, recurringFromBreakdown);
    excludedOneOffMonthly = avgOverStatements(sorted, (s) => s.feeBreakdown?.otherFixed ?? 0);
    statementTotalMonthly = avgOverStatements(sorted, (s) => s.totalFees ?? 0);

    const gap = statementTotalMonthly - recurringCardMonthly - excludedOneOffMonthly;
    if (gap > 0.01) {
      excludedOneOffMonthly += gap;
    }
  } else if (sorted.length > 0) {
    statementTotalMonthly = avgOverStatements(sorted, (s) => s.totalFees ?? 0);
    if (sorted.length >= 2) {
      recurringCardMonthly = medianMonthlyTotals(sorted);
      excludedOneOffMonthly = Math.max(0, statementTotalMonthly - recurringCardMonthly);
    } else {
      recurringCardMonthly = statementTotalMonthly;
      excludedOneOffMonthly = 0;
    }
  } else {
    const rate = parseFloat(form.currentEffectiveRate) || stmt?.effectiveRate || 0;
    statementTotalMonthly = volume > 0 && rate > 0 ? volume * (rate / 100) : 0;
    recurringCardMonthly = statementTotalMonthly;
    excludedOneOffMonthly = 0;
  }

  const recurringEffectiveRate =
    volume > 0
      ? (recurringCardMonthly / volume) * 100
      : parseFloat(form.currentEffectiveRate) || stmt?.effectiveRate || 0;

  return {
    recurringCardMonthly,
    excludedOneOffMonthly,
    statementTotalMonthly,
    recurringEffectiveRate,
    transactionCount,
    volume,
  };
}

/** Recurring pass-through fees on statement (excludes processor markup and one-offs). */
export function recurringPassThroughFees(stmt?: StatementData): number {
  if (!stmt?.feeBreakdown) return 0;
  const fb = stmt.feeBreakdown;
  return (
    fb.interchange +
    fb.networkFees +
    fb.nonQualSurcharge +
    fb.authFees +
    fb.bascStand +
    fb.stmtMail +
    fb.acctFee
  );
}
