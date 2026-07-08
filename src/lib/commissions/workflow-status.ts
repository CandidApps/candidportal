'use client';

import { matchDealToCommissionRow } from '@/lib/bmw/commission-match';
import type { BankDepositPeriodTotal } from '@/lib/services/bank-deposits';
import {
  SUPPLIER_IDS,
  SUPPLIER_LABELS,
  supplierPeriodTotals,
  type AgentCommissionRowView,
  type SupplierId,
  type SupplierImportBatch,
} from '@/lib/commissions/commission-store';
import { commissionUnderpaid, isPayoutExcluded } from '@/lib/commissions/escalate-commissions';
import { mergePaySourceVerifiedIntoTotals } from '@/lib/commissions/verify-commissions';
import {
  reconciledSupplierTotal,
  type SupplierPeriodAdjustment,
} from '@/lib/commissions/supplier-reconciliation';

export type WorkflowStepId = 'deposits' | 'suppliers' | 'expenses' | 'agents' | 'team';
export type WorkflowStepStatus = 'complete' | 'action' | 'blocked';

export type WorkflowStep = {
  id: WorkflowStepId;
  step: number;
  label: string;
  status: WorkflowStepStatus;
  complete: boolean;
  hint: string;
};

const MATCH_TOLERANCE = 0.02;
const EXPENSES_COMPLETE_KEY = 'candid-workflow-expenses-complete';

function depositsLoaded(depositTotals: Record<string, BankDepositPeriodTotal>): boolean {
  return Object.values(depositTotals).some((d) => d.total > 0);
}

function depositMatchesCommission(
  commissionTotal: number,
  depositTotal: number,
  hasCommissionImport: boolean,
): boolean {
  if (depositTotal <= 0) return true;
  if (!hasCommissionImport && commissionTotal === 0) return false;
  return Math.abs(depositTotal - commissionTotal) <= MATCH_TOLERANCE;
}

function unmatchedCount(
  imports: SupplierImportBatch[],
  period: string,
  supplier: SupplierId,
): number {
  let n = 0;
  for (const batch of imports) {
    if (batch.period !== period || batch.supplier !== supplier) continue;
    for (const row of batch.rows) {
      if (!matchDealToCommissionRow(batch.supplier, row)) n += 1;
    }
  }
  return n;
}

function supplierReportsComplete(
  imports: SupplierImportBatch[],
  period: string,
  depositTotals: Record<string, BankDepositPeriodTotal>,
  adjustments: SupplierPeriodAdjustment[] = [],
): { complete: boolean; hint: string } {
  if (!depositsLoaded(depositTotals)) {
    return { complete: false, hint: 'Load bank deposits first' };
  }

  const issues: string[] = [];
  const keys = [
    ...SUPPLIER_IDS,
    ...Object.keys(depositTotals).filter((k) => !(SUPPLIER_IDS as string[]).includes(k)),
  ];

  for (const key of keys) {
    const isKnown = (SUPPLIER_IDS as string[]).includes(key);
    const supplierId = isKnown ? (key as SupplierId) : null;
    const depositTotal = depositTotals[key]?.total ?? 0;
    if (depositTotal <= 0) continue;

    const importTotal = supplierId
      ? supplierPeriodTotals(imports, supplierId, period)
      : mergePaySourceVerifiedIntoTotals(key, period, 0);
    const commissionTotal = supplierId
      ? reconciledSupplierTotal(importTotal, adjustments, supplierId, period)
      : importTotal;
    const hasCommissionImport =
      supplierId != null
      && imports.some((i) => i.supplier === supplierId && i.period === period);
    const label = supplierId ? SUPPLIER_LABELS[supplierId] : depositTotals[key]?.label ?? key;

    if (!depositMatchesCommission(commissionTotal, depositTotal, hasCommissionImport)) {
      issues.push(`${label} not reconciled`);
    }
    if (
      supplierId != null
      && commissionUnderpaid(importTotal, depositTotal, hasCommissionImport)
      && !isPayoutExcluded(supplierId, period)
    ) {
      issues.push(`${label} underpaid`);
    }
    if (supplierId != null && unmatchedCount(imports, period, supplierId) > 0) {
      issues.push(`${label} has unmatched rows`);
    }
  }

  if (issues.length === 0) {
    return { complete: true, hint: 'Supplier reports reconciled with deposits' };
  }
  return { complete: false, hint: issues.slice(0, 2).join(' · ') };
}

function agentPaymentsComplete(agents: AgentCommissionRowView[]): boolean {
  const owing = agents.filter((a) => a.currentMonthOwed > 0);
  if (owing.length === 0) return true;
  return owing.every((a) => a.paid);
}

export type TeamPayoutWorkflowRow = {
  profileId: string;
  currentMonthOwed: number;
  paid: boolean;
};

function teamPayoutsComplete(rows: TeamPayoutWorkflowRow[]): boolean {
  const owing = rows.filter((r) => r.currentMonthOwed > 0);
  if (!owing.length) return true;
  return owing.every((r) => r.paid);
}

export function readExpensesComplete(period: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(EXPENSES_COMPLETE_KEY);
    const periods = raw ? (JSON.parse(raw) as string[]) : [];
    return periods.includes(period);
  } catch {
    return false;
  }
}

export function setExpensesComplete(period: string, complete: boolean): void {
  if (typeof window === 'undefined') return;
  const periods = new Set<string>();
  try {
    const raw = localStorage.getItem(EXPENSES_COMPLETE_KEY);
    for (const p of raw ? (JSON.parse(raw) as string[]) : []) periods.add(p);
  } catch {
    /* ignore */
  }
  if (complete) periods.add(period);
  else periods.delete(period);
  localStorage.setItem(EXPENSES_COMPLETE_KEY, JSON.stringify([...periods]));
  window.dispatchEvent(new Event('candid-commissions-updated'));
}

export function buildWorkflowSteps(
  period: string,
  imports: SupplierImportBatch[],
  depositTotals: Record<string, BankDepositPeriodTotal>,
  agents: AgentCommissionRowView[],
  expensesComplete: boolean,
  adjustments: SupplierPeriodAdjustment[] = [],
  teamPayouts: TeamPayoutWorkflowRow[] = [],
): WorkflowStep[] {
  const depositsDone = depositsLoaded(depositTotals);
  const suppliersResult = supplierReportsComplete(imports, period, depositTotals, adjustments);
  const suppliersDone = suppliersResult.complete;
  const agentsDone = agentPaymentsComplete(agents);
  const teamDone = teamPayoutsComplete(teamPayouts);

  const steps: Array<Omit<WorkflowStep, 'status'>> = [
    {
      id: 'deposits',
      step: 1,
      label: 'Bank deposits',
      complete: depositsDone,
      hint: depositsDone ? 'Deposits loaded for this period' : 'Import Chase activity for this period',
    },
    {
      id: 'suppliers',
      step: 2,
      label: 'Supplier reports',
      complete: suppliersDone,
      hint: suppliersResult.hint,
    },
    {
      id: 'expenses',
      step: 3,
      label: 'Expenses',
      complete: suppliersDone && expensesComplete,
      hint: expensesComplete
        ? 'All expenses included or rejected for this period'
        : 'Review and include or reject each expense',
    },
    {
      id: 'agents',
      step: 4,
      label: 'Agent payments',
      complete: agentsDone,
      hint: agentsDone
        ? 'All agent payouts recorded'
        : agents.filter((a) => !a.paid && a.currentMonthOwed > 0).length > 0
          ? `${agents.filter((a) => !a.paid && a.currentMonthOwed > 0).length} agent(s) awaiting payout`
          : 'Review and mark agent payouts',
    },
    {
      id: 'team',
      step: 5,
      label: 'Team payouts',
      complete: teamDone,
      hint: teamDone
        ? 'All internal team payouts recorded'
        : teamPayouts.filter((r) => !r.paid && r.currentMonthOwed > 0).length > 0
          ? `${teamPayouts.filter((r) => !r.paid && r.currentMonthOwed > 0).length} team member(s) awaiting payout`
          : 'Review and mark internal house-share payouts',
    },
  ];

  return steps.map((s, i) => {
    const priorComplete = steps.slice(0, i).every((p) => p.complete);
    let status: WorkflowStepStatus;
    if (s.complete) status = 'complete';
    else if (!priorComplete) status = 'blocked';
    else status = 'action';
    return { ...s, status };
  });
}

export function workflowProgress(steps: WorkflowStep[]): {
  completed: number;
  total: number;
  nextStep: WorkflowStep | null;
} {
  const completed = steps.filter((s) => s.complete).length;
  const nextStep = steps.find((s) => !s.complete) ?? null;
  return { completed, total: steps.length, nextStep };
}
