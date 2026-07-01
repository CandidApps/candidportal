import { resolveAgentMergeKey } from '@/lib/bmw/deal-master';
import type { BmwAgentRate } from '@/lib/bmw/types';
import { periodBefore } from '@/lib/commissions/commission-store';
import type { AgentCommissionRow } from '@/lib/commissions/commission-store';

export type CommissionReviewStatus = 'pending' | 'included' | 'rejected';
export type CommissionAllocationType = 'customer' | 'agent_fee';

export type CommissionExpenseRow = {
  id: string;
  merchant: string | null;
  category: string | null;
  amount: number;
  spent_on: string | null;
  note: string | null;
  bank_deposit_import_id: number | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_agent: string | null;
  queued_for_commission: boolean;
  commission_period: string | null;
  commission_review_status: CommissionReviewStatus;
  commission_allocation_type: CommissionAllocationType | null;
  commission_agent_id: string | null;
  commission_deduction_note: string | null;
  commission_rejection_note: string | null;
};

export function expenseFingerprint(merchant: string | null, category: string | null): string {
  return `${(merchant ?? '').trim().toLowerCase()}|${(category ?? '').trim().toLowerCase()}`;
}

/** Manual My Expenses entry queued for step 3 — not tied to spent_on date. */
export function isPendingManualQueueExpense(expense: {
  queued_for_commission?: boolean | null;
  bank_deposit_import_id?: number | null;
  commission_review_status?: string | null;
}): boolean {
  return (
    Boolean(expense.queued_for_commission)
    && expense.bank_deposit_import_id == null
    && expense.commission_review_status === 'pending'
  );
}

export function expenseBelongsInPeriodView(
  expense: {
    commission_period?: string | null;
    queued_for_commission?: boolean | null;
    bank_deposit_import_id?: number | null;
    commission_review_status?: string | null;
  },
  period: string,
  latestPeriod: string,
): boolean {
  if (isPendingManualQueueExpense(expense)) {
    return period === latestPeriod;
  }
  return expense.commission_period === period;
}

export function periodExpensesComplete(expenses: CommissionExpenseRow[]): boolean {
  if (expenses.length === 0) return true;
  return expenses.every(
    (e) => e.commission_review_status === 'included' || e.commission_review_status === 'rejected',
  );
}

export function includedExpensesForDeductions(expenses: CommissionExpenseRow[]): CommissionExpenseRow[] {
  return expenses.filter((e) => e.commission_review_status === 'included');
}

function resolveAgentKeyForExpense(exp: CommissionExpenseRow, agents: BmwAgentRate[]): string | null {
  if (exp.commission_agent_id) return resolveAgentMergeKey(exp.commission_agent_id);
  if (exp.customer_agent) {
    const byName = agents.find(
      (a) => a.name === exp.customer_agent || a.id === exp.customer_agent,
    );
    if (byName) return resolveAgentMergeKey(byName.id);
  }
  return null;
}

/** Subtract included commission expenses from agent payout rows (step 4). */
export function applyExpenseDeductionsToAgentRows<T extends AgentCommissionRow>(
  rows: T[],
  expenses: CommissionExpenseRow[],
  agents: BmwAgentRate[] = [],
): T[] {
  const included = includedExpensesForDeductions(expenses);
  if (!included.length) return rows;

  const deductionsByAgent = new Map<string, { total: number; lines: CommissionExpenseRow[] }>();

  for (const exp of included) {
    const agentKey = resolveAgentKeyForExpense(exp, agents);
    if (!agentKey) continue;

    const amt = Math.abs(Number(exp.amount) || 0);
    if (amt === 0) continue;
    const bucket = deductionsByAgent.get(agentKey) ?? { total: 0, lines: [] };
    bucket.total += amt;
    bucket.lines.push(exp);
    deductionsByAgent.set(agentKey, bucket);
  }

  return rows
    .map((row) => {
      const ded = deductionsByAgent.get(row.agentId);
      if (!ded) return row;

      let remaining = ded.total;
      const customers = row.customers.map((c) => {
        if (remaining <= 0) return c;
        const take = Math.min(c.amount, remaining);
        remaining -= take;
        return { ...c, amount: Math.round((c.amount - take) * 100) / 100 };
      });

      const directRemainder = Math.max(0, remaining);
      const currentMonthOwed = Math.max(
        0,
        Math.round((row.currentMonthOwed - ded.total) * 100) / 100,
      );

      if (directRemainder > 0.001) {
        const first = ded.lines[0]!;
        const label =
          first.commission_allocation_type === 'customer' && first.customer_name
            ? `${first.customer_name} — ${first.merchant ?? 'Expense'}`
            : ded.lines.length === 1
              ? first.merchant ?? first.commission_deduction_note ?? 'Commission expense'
              : 'Commission expenses';
        customers.push({
          id: `expense-deduction-${row.agentId}-${first.id}`,
          company: label,
          supplier: 'Expense',
          amount: -Math.round(directRemainder * 100) / 100,
          commissionRate: 0,
        });
      }

      return {
        ...row,
        currentMonthOwed,
        customers: customers.filter((c) => Math.abs(c.amount) > 0.001),
      } as T;
    })
    .filter((row) => row.currentMonthOwed > 0.001 || row.customers.length > 0);
}

export function previousPeriodsForTemplate(period: string, count = 6): string[] {
  const out: string[] = [];
  let p = period;
  for (let i = 0; i < count; i += 1) {
    p = periodBefore(p);
    out.push(p);
  }
  return out;
}
