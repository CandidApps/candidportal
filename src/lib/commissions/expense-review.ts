import { resolveAgentMergeKey, getBmwAgentRates, bmwCustomerIdForDeal, getBmwDeals } from '@/lib/bmw/deal-master';
import { normalizeUid } from '@/lib/bmw/deal-key';
import type { BmwAgentRate } from '@/lib/bmw/types';
import { periodBefore } from '@/lib/commissions/commission-store';
import type { AgentCommissionCustomer, AgentCommissionRow } from '@/lib/commissions/commission-store';
import type { TeamPayoutRow } from '@/lib/team/internal-commission-engine';

export type CommissionReviewStatus = 'pending' | 'included' | 'rejected' | 'deferred';
export type CommissionAllocationType =
  | 'customer'
  | 'agent_fee'
  | 'internal_reimburse'
  | 'internal_partner'
  | 'charge_and_reimburse';
export type CommissionChargeMode = 'full' | 'tier_percent';

export type ExpensePartnerRef = {
  profileId: string;
  name?: string;
  percent: number;
};

export type ExpenseCustomerRef = {
  id: string;
  name: string;
  agent?: string;
};

export type CommissionExpenseRow = {
  id: string;
  merchant: string | null;
  category: string | null;
  amount: number;
  spent_on: string | null;
  note: string | null;
  bank_deposit_import_id: number | null;
  owner_id?: string | null;
  owner_display_name?: string | null;
  owner_email?: string | null;
  commission_reimburse_profile_id?: string | null;
  reimburse_display_name?: string | null;
  reimburse_email?: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_agent: string | null;
  commission_customer_ids?: ExpenseCustomerRef[];
  queued_for_commission: boolean;
  commission_period: string | null;
  commission_target_period?: string | null;
  commission_review_status: CommissionReviewStatus;
  commission_allocation_type: CommissionAllocationType | null;
  commission_agent_id: string | null;
  commission_charge_mode?: CommissionChargeMode | null;
  commission_charge_tier_rate?: number | null;
  commission_charge_amount?: number | null;
  commission_deduction_note: string | null;
  commission_rejection_note: string | null;
  resubmitted_from_id?: string | null;
  commission_internal_splits?: ExpensePartnerRef[];
};

export function parseExpensePartnerSplits(raw: unknown): ExpensePartnerRef[] {
  if (!Array.isArray(raw)) return [];
  const out: ExpensePartnerRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const profileId = typeof row.profileId === 'string' ? row.profileId.trim() : '';
    if (!profileId) continue;
    out.push({
      profileId,
      name: typeof row.name === 'string' ? row.name : undefined,
      percent: Number(row.percent) || 0,
    });
  }
  return out;
}

export function expensePartnerSplits(exp: CommissionExpenseRow): ExpensePartnerRef[] {
  const parsed = parseExpensePartnerSplits(exp.commission_internal_splits);
  if (parsed.length) return parsed;
  return [];
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

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
    && (expense.commission_review_status === 'pending' || expense.commission_review_status === 'deferred')
  );
}

export function expenseBelongsInPeriodView(
  expense: {
    commission_period?: string | null;
    commission_target_period?: string | null;
    queued_for_commission?: boolean | null;
    bank_deposit_import_id?: number | null;
    commission_review_status?: string | null;
  },
  period: string,
  latestPeriod: string,
): boolean {
  if (expense.commission_review_status === 'rejected') return false;

  const target = expense.commission_target_period?.trim();
  if (target) return target === period;

  if (expense.commission_review_status === 'deferred') {
    return period === latestPeriod;
  }

  if (isPendingManualQueueExpense(expense)) {
    return period === latestPeriod;
  }
  return expense.commission_period === period;
}

export function periodExpensesComplete(expenses: CommissionExpenseRow[]): boolean {
  const actionable = expenses.filter((e) => e.commission_review_status !== 'rejected');
  if (actionable.length === 0) return true;
  return actionable.every(
    (e) => e.commission_review_status === 'included' || e.commission_review_status === 'deferred',
  );
}

export function includedExpensesForDeductions(expenses: CommissionExpenseRow[]): CommissionExpenseRow[] {
  return expenses.filter((e) => e.commission_review_status === 'included');
}

export function expenseCustomers(exp: CommissionExpenseRow): ExpenseCustomerRef[] {
  if (Array.isArray(exp.commission_customer_ids) && exp.commission_customer_ids.length > 0) {
    return exp.commission_customer_ids.filter((c) => c?.id);
  }
  if (exp.customer_id) {
    return [
      {
        id: exp.customer_id,
        name: exp.customer_name ?? '',
        agent: exp.customer_agent ?? undefined,
      },
    ];
  }
  return [];
}

export function effectiveExpenseChargeAmount(exp: CommissionExpenseRow): number {
  const base = Math.abs(Number(exp.amount) || 0);
  if (exp.commission_charge_amount != null && Number.isFinite(Number(exp.commission_charge_amount))) {
    return Math.abs(Number(exp.commission_charge_amount));
  }
  if (exp.commission_charge_mode === 'tier_percent') {
    const rate = Number(exp.commission_charge_tier_rate) || 0;
    return Math.round(base * (rate / 100) * 100) / 100;
  }
  return base;
}

export function agentTierOptions(agentCommId: string, agents: BmwAgentRate[] = getBmwAgentRates()): BmwAgentRate[] {
  if (!agentCommId.trim()) return [];
  const mergeKey = resolveAgentMergeKey(agentCommId);
  return agents
    .filter((a) => resolveAgentMergeKey(a.id) === mergeKey)
    .sort((a, b) => a.commissionRate - b.commissionRate);
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

function agentKeyForCustomerRef(
  ref: ExpenseCustomerRef,
  agents: BmwAgentRate[],
): string | null {
  if (ref.agent) {
    const byName = agents.find((a) => a.name === ref.agent || a.id === ref.agent);
    if (byName) return resolveAgentMergeKey(byName.id);
  }
  return null;
}

function reimburseSubmitterFromExpense(
  exp: CommissionExpenseRow,
  byProfile: Map<string, TeamPayoutRow>,
  amt: number,
): void {
  const profileId = reimburseeProfileId(exp);
  if (!profileId || amt <= 0) return;
  const existing = byProfile.get(profileId);
  const base: TeamPayoutRow = existing ?? {
    profileId,
    displayName: reimburseeLabel(exp),
    email: exp.reimburse_email ?? exp.owner_email ?? '',
    participantType: 'partner',
    defaultHouseSharePercent: 0,
    currentMonthOwed: 0,
    lastMonthPaid: 0,
    ytdPaid: 0,
    dealCount: 0,
    deals: [],
  };
  base.currentMonthOwed = roundMoney(base.currentMonthOwed + amt);
  base.deals.push({
    dealUid: `expense-reimburse-${exp.id}`,
    company: exp.merchant ?? 'Expense reimbursement',
    supplier: 'Expense',
    gross: 0,
    agentPaid: 0,
    houseNet: amt,
    sharePercent: 100,
    amount: amt,
    ruleLabel: `Reimburse ${reimburseeLabel(exp)}`,
    primaryAgentName: '',
  });
  base.dealCount = base.deals.length;
  byProfile.set(profileId, base);
}

function dealUidsForExpenseCustomerRef(ref: ExpenseCustomerRef): Set<string> {
  const uids = new Set<string>();
  for (const deal of getBmwDeals()) {
    if (bmwCustomerIdForDeal(deal) !== ref.id) continue;
    const uid = normalizeUid(deal.dealUid);
    if (uid) uids.add(uid);
  }
  return uids;
}

function customerLineMatchesExpenseRef(
  customer: { id: string; company: string },
  ref: ExpenseCustomerRef,
): boolean {
  const uids = dealUidsForExpenseCustomerRef(ref);
  if (uids.size > 0) {
    for (const uid of uids) {
      if (customer.id.includes(uid)) return true;
    }
  }
  const refName = ref.name.trim().toLowerCase();
  if (!refName) return false;
  return customer.company.trim().toLowerCase() === refName;
}

function deductFromMatchingCustomers<T extends { id: string; company: string; amount: number }>(
  customers: T[],
  ref: ExpenseCustomerRef,
  amount: number,
): { customers: T[]; unmatched: number } {
  let remaining = amount;
  const updated = customers.map((c) => {
    if (remaining <= 0.001 || !customerLineMatchesExpenseRef(c, ref)) return c;
    const take = Math.min(c.amount, remaining);
    remaining = roundMoney(remaining - take);
    return { ...c, amount: roundMoney(c.amount - take) };
  });
  return { customers: updated, unmatched: roundMoney(Math.max(0, remaining)) };
}

function sharePerExpenseCustomerRef(
  refs: ExpenseCustomerRef[],
  total: number,
  refIndex: number,
): number {
  if (refs.length <= 1) return total;
  const perAccount = roundMoney(total / refs.length);
  if (refIndex < refs.length - 1) return perAccount;
  const prior = perAccount * (refs.length - 1);
  return roundMoney(total - prior);
}

/** Equal-split expense amount across selected customers, grouped by agent. */
function deductionsFromExpense(
  exp: CommissionExpenseRow,
  agents: BmwAgentRate[],
): Map<string, number> {
  const out = new Map<string, number>();
  const total = effectiveExpenseChargeAmount(exp);
  if (total <= 0) return out;

  const refs = expenseCustomers(exp);
  if (exp.commission_allocation_type === 'charge_and_reimburse') {
    const key = exp.commission_agent_id
      ? resolveAgentMergeKey(exp.commission_agent_id)
      : null;
    if (key) out.set(key, total);
    return out;
  }

  if (exp.commission_allocation_type === 'customer' && refs.length > 1) {
    const perAccount = Math.round((total / refs.length) * 100) / 100;
    let allocated = 0;
    refs.forEach((ref, idx) => {
      const share =
        idx === refs.length - 1
          ? Math.round((total - allocated) * 100) / 100
          : perAccount;
      allocated = Math.round((allocated + share) * 100) / 100;
      const key =
        agentKeyForCustomerRef(ref, agents) ?? resolveAgentKeyForExpense(exp, agents);
      if (!key || share <= 0) return;
      out.set(key, Math.round(((out.get(key) ?? 0) + share) * 100) / 100);
    });
    return out;
  }

  const key = resolveAgentKeyForExpense(exp, agents);
  if (key) out.set(key, total);
  return out;
}

export function expenseAllocationLabel(exp: CommissionExpenseRow): string {
  const merchant = exp.merchant?.trim() || 'Expense';
  switch (exp.commission_allocation_type) {
    case 'customer': {
      const refs = expenseCustomers(exp);
      if (refs.length > 1) {
        const names = refs.map((ref) => ref.name).filter(Boolean).join(', ');
        return names ? `Customer accounts (${names}) — ${merchant}` : `Customer accounts — ${merchant}`;
      }
      if (refs.length === 1 && refs[0]!.name) {
        return `Customer (${refs[0]!.name}) — ${merchant}`;
      }
      return `Customer — ${merchant}`;
    }
    case 'agent_fee':
      return `Agent fee — ${merchant}`;
    case 'charge_and_reimburse':
      return `Charge agent & reimburse — ${merchant}`;
    default:
      return exp.commission_deduction_note?.trim() || merchant;
  }
}

function availableCommissionResidual(customer: AgentCommissionCustomer): number {
  if (customer.lineKind === 'expense' || customer.lineKind === 'reconciliation') return 0;
  const gross = customer.grossResidual ?? customer.amount;
  const deducted = customer.expenseDeduction ?? 0;
  return roundMoney(Math.max(0, gross - deducted));
}

function applyExpenseToCustomerLine(
  customer: AgentCommissionCustomer,
  share: number,
  label: string,
): AgentCommissionCustomer {
  const gross = customer.grossResidual ?? customer.amount;
  const nextDeduction = roundMoney((customer.expenseDeduction ?? 0) + share);
  return {
    ...customer,
    grossResidual: gross,
    expenseDeduction: nextDeduction,
    expenseAllocation: customer.expenseAllocation
      ? `${customer.expenseAllocation}; ${label}`
      : label,
    amount: roundMoney(gross - nextDeduction),
  };
}

function makeAgentExpenseLine(
  exp: CommissionExpenseRow,
  agentId: string,
  amount: number,
  label: string,
): AgentCommissionCustomer {
  return {
    id: `expense-line-${agentId}-${exp.id}`,
    company: exp.merchant ?? exp.commission_deduction_note ?? 'Commission expense',
    supplier: 'Expense',
    amount,
    commissionRate: 0,
    lineKind: 'expense',
    expenseAllocation: label,
  };
}

function keepAgentCustomerLine(customer: AgentCommissionCustomer): boolean {
  if (customer.lineKind === 'expense' || customer.lineKind === 'reconciliation') {
    return Math.abs(customer.amount) > 0.001;
  }
  return (
    Math.abs(customer.amount) > 0.001
    || Math.abs(customer.grossResidual ?? 0) > 0.001
    || Math.abs(customer.expenseDeduction ?? 0) > 0.001
    || Math.abs(customer.reconciliationDeduction ?? 0) > 0.001
  );
}

function applyExpenseDeductionsAgentView<T extends AgentCommissionRow>(
  row: T,
  applicable: CommissionExpenseRow[],
  agents: BmwAgentRate[],
): T {
  let customers: AgentCommissionCustomer[] = row.customers.map((customer) => ({
    ...customer,
    grossResidual: customer.grossResidual ?? customer.amount,
    lineKind:
      customer.lineKind
      ?? (customer.id.startsWith('expense-') || customer.id.startsWith('recon-')
        ? customer.id.startsWith('expense-')
          ? 'expense'
          : 'reconciliation'
        : 'commission'),
  }));
  let totalDeduction = 0;

  for (const exp of applicable) {
    const agentAmt = deductionsFromExpense(exp, agents).get(row.agentId) ?? 0;
    if (agentAmt <= 0) continue;
    totalDeduction = roundMoney(totalDeduction + agentAmt);
    const label = expenseAllocationLabel(exp);

    if (exp.commission_allocation_type === 'customer') {
      const refs = expenseCustomers(exp);
      if (!refs.length) {
        customers.push(makeAgentExpenseLine(exp, row.agentId, -agentAmt, label));
        continue;
      }

      refs.forEach((ref, idx) => {
        const share = sharePerExpenseCustomerRef(refs, agentAmt, idx);
        let applied = 0;
        customers = customers.map((customer) => {
          if (share - applied <= 0.001) return customer;
          if (!customerLineMatchesExpenseRef(customer, ref)) return customer;
          const available = availableCommissionResidual(customer);
          if (available <= 0.001) return customer;
          const take = Math.min(available, roundMoney(share - applied));
          if (take <= 0.001) return customer;
          applied = roundMoney(applied + take);
          return applyExpenseToCustomerLine(customer, take, label);
        });

        const unmatched = roundMoney(share - applied);
        if (unmatched > 0.001) {
          const accountLabel = ref.name
            ? `${label} (remaining on ${ref.name})`
            : `${label} (unallocated)`;
          customers.push(makeAgentExpenseLine(exp, row.agentId, -unmatched, accountLabel));
        }
      });
      continue;
    }

    customers.push(makeAgentExpenseLine(exp, row.agentId, -agentAmt, label));
  }

  const currentMonthOwed = roundMoney(row.currentMonthOwed - totalDeduction);

  return {
    ...row,
    currentMonthOwed,
    customers: customers.filter((customer) => keepAgentCustomerLine(customer)),
  } as T;
}

function applyExpenseDeductionsHiddenView<T extends AgentCommissionRow>(
  row: T,
  applicable: CommissionExpenseRow[],
  agents: BmwAgentRate[],
): T {
  let customers = row.customers.map((c) => ({ ...c }));
  let genericRemainder = 0;
  let totalDeduction = 0;

  for (const exp of applicable) {
    const agentAmt = deductionsFromExpense(exp, agents).get(row.agentId) ?? 0;
    if (agentAmt <= 0) continue;
    totalDeduction = roundMoney(totalDeduction + agentAmt);

    if (exp.commission_allocation_type === 'customer') {
      const refs = expenseCustomers(exp);
      if (!refs.length) {
        genericRemainder = roundMoney(genericRemainder + agentAmt);
        continue;
      }
      refs.forEach((ref, idx) => {
        const share = sharePerExpenseCustomerRef(refs, agentAmt, idx);
        const { customers: nextCustomers, unmatched } = deductFromMatchingCustomers(
          customers,
          ref,
          share,
        );
        customers = nextCustomers;
        genericRemainder = roundMoney(genericRemainder + unmatched);
      });
    } else {
      genericRemainder = roundMoney(genericRemainder + agentAmt);
    }
  }

  if (genericRemainder > 0.001) {
    let remaining = genericRemainder;
    customers = customers.map((c) => {
      if (remaining <= 0.001) return c;
      const take = Math.min(c.amount, remaining);
      remaining = roundMoney(remaining - take);
      return { ...c, amount: roundMoney(c.amount - take) };
    });
    remaining = roundMoney(Math.max(0, remaining));

    if (remaining > 0.001) {
      const first = applicable[0]!;
      const refs = expenseCustomers(first);
      const label =
        first.commission_allocation_type === 'customer' && refs.length
          ? `${refs.map((r) => r.name).filter(Boolean).join(', ') || 'Accounts'} — ${first.merchant ?? 'Expense'}`
          : applicable.length === 1
            ? first.merchant ?? first.commission_deduction_note ?? 'Commission expense'
            : 'Commission expenses';
      customers.push({
        id: `expense-deduction-${row.agentId}-${first.id}`,
        company: label,
        supplier: 'Expense',
        amount: -remaining,
        commissionRate: 0,
        lineKind: 'expense',
      });
    }
  }

  const currentMonthOwed = roundMoney(row.currentMonthOwed - totalDeduction);

  return {
    ...row,
    currentMonthOwed,
    customers: customers.filter((c) => Math.abs(c.amount) > 0.001),
  } as T;
}

/** Subtract included commission expenses from agent payout rows (step 4). */
export function applyExpenseDeductionsToAgentRows<T extends AgentCommissionRow>(
  rows: T[],
  expenses: CommissionExpenseRow[],
  agents: BmwAgentRate[] = [],
  opts?: { detailMode?: 'admin' | 'agent' },
): T[] {
  const included = includedExpensesForDeductions(expenses);
  if (!included.length) return rows;
  const detailMode = opts?.detailMode ?? 'admin';

  return rows
    .map((row) => {
      const applicable = included.filter((exp) => {
        const byAgent = deductionsFromExpense(exp, agents);
        return byAgent.has(row.agentId);
      });
      if (!applicable.length) return row;

      return detailMode === 'agent'
        ? applyExpenseDeductionsHiddenView(row, applicable, agents)
        : applyExpenseDeductionsAgentView(row, applicable, agents);
    })
    .filter((row) => Math.abs(row.currentMonthOwed) > 0.001 || row.customers.length > 0);
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

export function submitterLabel(exp: CommissionExpenseRow): string {
  return exp.owner_display_name?.trim() || exp.owner_email?.trim() || 'Unknown submitter';
}

export function reimburseeProfileId(exp: CommissionExpenseRow): string | null {
  return exp.commission_reimburse_profile_id ?? exp.owner_id ?? null;
}

export function reimburseeLabel(exp: CommissionExpenseRow): string {
  if (exp.commission_reimburse_profile_id) {
    return exp.reimburse_display_name?.trim() || exp.reimburse_email?.trim() || submitterLabel(exp);
  }
  return submitterLabel(exp);
}

/** Apply internal reimbursements and partner expense splits to team payout rows (step 5). */
export function applyExpenseAdjustmentsToTeamRows(
  rows: TeamPayoutRow[],
  expenses: CommissionExpenseRow[],
): TeamPayoutRow[] {
  const included = includedExpensesForDeductions(expenses);
  if (!included.length) return rows;

  const byProfile = new Map(rows.map((r) => [r.profileId, { ...r, deals: [...r.deals] }]));

  for (const exp of included) {
    const amt = effectiveExpenseChargeAmount(exp);
    if (amt <= 0) continue;

    if (exp.commission_allocation_type === 'internal_reimburse' && reimburseeProfileId(exp)) {
      reimburseSubmitterFromExpense(exp, byProfile, amt);
      continue;
    }

    if (exp.commission_allocation_type === 'charge_and_reimburse' && reimburseeProfileId(exp)) {
      reimburseSubmitterFromExpense(exp, byProfile, amt);
      continue;
    }

    if (exp.commission_allocation_type === 'internal_partner') {
      const splits = expensePartnerSplits(exp);
      const totalPct = splits.reduce((s, p) => s + Math.max(0, p.percent), 0);
      if (totalPct <= 0) continue;
      let allocated = 0;
      splits.forEach((split, idx) => {
        const pct = Math.max(0, split.percent);
        if (pct <= 0) return;
        const share =
          idx === splits.length - 1
            ? roundMoney(amt - allocated)
            : roundMoney(amt * (pct / totalPct));
        allocated = roundMoney(allocated + share);
        const row = byProfile.get(split.profileId);
        if (!row || share <= 0) return;
        row.currentMonthOwed = roundMoney(Math.max(0, row.currentMonthOwed - share));
        row.deals.push({
          dealUid: `expense-partner-${exp.id}-${split.profileId}`,
          company: exp.merchant ?? 'Shared internal expense',
          supplier: 'Expense',
          gross: 0,
          agentPaid: 0,
          houseNet: -share,
          sharePercent: pct,
          amount: -share,
          ruleLabel: `Partner share ${pct}%`,
          primaryAgentName: '',
        });
        row.dealCount = row.deals.length;
      });
    }
  }

  return [...byProfile.values()]
    .filter((r) => r.currentMonthOwed > 0.001 || r.deals.length > 0)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
}
