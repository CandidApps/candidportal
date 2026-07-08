import {
  resolveAgentDisplayName,
  resolveAgentMergeKey,
} from '@/lib/bmw/deal-master';
import { paySourceForSupplier, supplierForPaySource } from '@/lib/bmw/pay-source-map';
import type { BmwAgentRate } from '@/lib/bmw/types';
import { matchPeriodRows } from '@/lib/commissions/agent-commission-engine';
import type { AgentCommissionRow } from '@/lib/commissions/commission-store';
import {
  SUPPLIER_LABELS,
  type SupplierId,
  type SupplierImportBatch,
} from '@/lib/commissions/supplier-config';

export const RECONCILIATION_TOLERANCE = 0.02;

export type ReconciliationResolutionType =
  | 'candid_revenue'
  | 'candid_absorb'
  | 'agent_charge'
  | 'agent_pro_rata'
  | 'agent_bonus';

export type SupplierPeriodAdjustment = {
  id: string;
  supplierId: SupplierId;
  period: string;
  /** Signed dollars added to import total (deposit − import closes variance). */
  amount: number;
  resolutionType: ReconciliationResolutionType;
  agentMergeKeys: string[];
  showOnAgentReport: boolean;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export const SHORTFALL_RESOLUTIONS: ReconciliationResolutionType[] = [
  'candid_absorb',
  'agent_charge',
  'agent_pro_rata',
];

export const OVERAGE_RESOLUTIONS: ReconciliationResolutionType[] = [
  'candid_revenue',
  'agent_bonus',
];

export const RESOLUTION_LABELS: Record<ReconciliationResolutionType, string> = {
  candid_revenue: 'Candid revenue (house keeps overage)',
  candid_absorb: 'Candid absorbs shortfall',
  agent_charge: 'Charge one agent (line item on report)',
  agent_pro_rata: 'Split among selected agents (no line item)',
  agent_bonus: 'Bonus to one agent (line item on report)',
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function adjustmentsForSupplier(
  adjustments: SupplierPeriodAdjustment[],
  supplierId: SupplierId,
  period: string,
): SupplierPeriodAdjustment[] {
  return adjustments.filter((a) => a.supplierId === supplierId && a.period === period);
}

export function adjustmentSum(
  adjustments: SupplierPeriodAdjustment[],
  supplierId: SupplierId,
  period: string,
): number {
  return roundMoney(
    adjustmentsForSupplier(adjustments, supplierId, period).reduce((s, a) => s + a.amount, 0),
  );
}

export function reconciledSupplierTotal(
  importTotal: number,
  adjustments: SupplierPeriodAdjustment[],
  supplierId: SupplierId,
  period: string,
): number {
  return roundMoney(importTotal + adjustmentSum(adjustments, supplierId, period));
}

export function remainingVariance(
  importTotal: number,
  depositTotal: number | null | undefined,
  adjustments: SupplierPeriodAdjustment[],
  supplierId: SupplierId,
  period: string,
): number | null {
  if (depositTotal == null) return null;
  return roundMoney(depositTotal - reconciledSupplierTotal(importTotal, adjustments, supplierId, period));
}

export function isSupplierReconciled(
  importTotal: number,
  depositTotal: number | null | undefined,
  adjustments: SupplierPeriodAdjustment[],
  supplierId: SupplierId,
  period: string,
): boolean {
  const variance = remainingVariance(importTotal, depositTotal, adjustments, supplierId, period);
  if (variance == null) return false;
  return Math.abs(variance) <= RECONCILIATION_TOLERANCE;
}

export type SelectableAgent = {
  mergeKey: string;
  displayName: string;
  agentCommId: string;
  hasPayoutOnSupplier: boolean;
};

export function listSelectableAgents(
  rates: BmwAgentRate[],
  supplierId: SupplierId,
  period: string,
  opts?: {
    payingMergeKeys?: Set<string>;
    imports?: SupplierImportBatch[];
  },
): SelectableAgent[] {
  const paying = opts?.payingMergeKeys
    ?? (opts?.imports
      ? agentsWithPayoutOnSupplier(opts.imports, supplierId, period)
      : new Set<string>());
  const seen = new Set<string>();
  const out: SelectableAgent[] = [];

  for (const rate of rates) {
    const mergeKey = resolveAgentMergeKey(rate.id);
    if (seen.has(mergeKey)) continue;
    seen.add(mergeKey);
    out.push({
      mergeKey,
      displayName: rate.name,
      agentCommId: rate.id,
      hasPayoutOnSupplier: paying.has(mergeKey),
    });
  }

  return out.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
  );
}

export function payingMergeKeysOnSupplier(
  imports: SupplierImportBatch[],
  supplierId: SupplierId,
  period: string,
): Set<string> {
  return agentsWithPayoutOnSupplier(imports, supplierId, period);
}

export function agentsWithPayoutOnSupplier(
  imports: SupplierImportBatch[],
  supplierId: SupplierId,
  period: string,
): Set<string> {
  const keys = new Set<string>();
  for (const line of matchPeriodRows(imports, period)) {
    const sid = supplierForPaySource(line.supplier);
    if (sid === supplierId) keys.add(resolveAgentMergeKey(line.agentCommId));
  }
  return keys;
}

export function displayNameForMergeKey(mergeKey: string, rates: BmwAgentRate[]): string {
  for (const rate of rates) {
    if (resolveAgentMergeKey(rate.id) === mergeKey) return rate.name;
  }
  return mergeKey;
}

function ensureAgentRow(
  rowMap: Map<string, AgentCommissionRow & { paid?: boolean }>,
  mergeKey: string,
  rates: BmwAgentRate[],
): AgentCommissionRow {
  const existing = rowMap.get(mergeKey);
  if (existing) return existing;

  const created: AgentCommissionRow = {
    agentId: mergeKey,
    company: displayNameForMergeKey(mergeKey, rates),
    contactEmail: '',
    currentMonthOwed: 0,
    lastMonthPaid: 0,
    ytdPaid: 0,
    customers: [],
  };
  rowMap.set(mergeKey, created);
  return created;
}

function applyAgentDeduction(
  rowMap: Map<string, AgentCommissionRow>,
  mergeKey: string,
  amount: number,
  showOnReport: boolean,
  note: string,
  supplierId: SupplierId,
  rates: BmwAgentRate[],
): void {
  if (amount <= 0) return;
  const row = ensureAgentRow(rowMap, mergeKey, rates);
  const supplierLabel = SUPPLIER_LABELS[supplierId];

  if (showOnReport) {
    row.customers.push({
      id: `recon-${supplierId}-${mergeKey}-${note.slice(0, 24)}`,
      company: note,
      supplier: supplierLabel,
      amount: -roundMoney(amount),
      commissionRate: 0,
    });
    row.currentMonthOwed = roundMoney(row.currentMonthOwed - amount);
    return;
  }

  let remaining = amount;
  for (const customer of row.customers) {
    if (remaining <= 0) break;
    if (customer.amount <= 0) continue;
    const take = Math.min(customer.amount, remaining);
    customer.amount = roundMoney(customer.amount - take);
    remaining = roundMoney(remaining - take);
  }
  row.currentMonthOwed = roundMoney(row.currentMonthOwed - amount);
  row.customers = row.customers.filter((c) => Math.abs(c.amount) > 0.001);
}

function applyAgentBonus(
  rowMap: Map<string, AgentCommissionRow>,
  mergeKey: string,
  amount: number,
  showOnReport: boolean,
  note: string,
  supplierId: SupplierId,
  rates: BmwAgentRate[],
): void {
  if (amount <= 0) return;
  const row = ensureAgentRow(rowMap, mergeKey, rates);
  const supplierLabel = SUPPLIER_LABELS[supplierId];

  if (showOnReport) {
    row.customers.push({
      id: `recon-${supplierId}-${mergeKey}-${note.slice(0, 24)}`,
      company: note,
      supplier: supplierLabel,
      amount: roundMoney(amount),
      commissionRate: 0,
    });
  }
  row.currentMonthOwed = roundMoney(row.currentMonthOwed + amount);
}

/** Apply supplier reconciliation adjustments to agent payout rows for a period. */
export function applyReconciliationToAgentRows<T extends AgentCommissionRow>(
  rows: T[],
  adjustments: SupplierPeriodAdjustment[],
  period: string,
  rates: BmwAgentRate[] = [],
): T[] {
  const periodAdjustments = adjustments.filter((a) => a.period === period);
  if (!periodAdjustments.length) return rows;

  const rowMap = new Map<string, AgentCommissionRow>(
    rows.map((row) => [row.agentId, { ...row, customers: [...row.customers] }]),
  );

  for (const adj of periodAdjustments) {
    const impact = Math.abs(adj.amount);
    if (impact <= RECONCILIATION_TOLERANCE) continue;

    if (adj.resolutionType === 'candid_revenue' || adj.resolutionType === 'candid_absorb') {
      continue;
    }

    const note = adj.note.trim() || `${SUPPLIER_LABELS[adj.supplierId]} reconciliation`;

    if (adj.resolutionType === 'agent_charge' && adj.agentMergeKeys.length === 1) {
      applyAgentDeduction(
        rowMap,
        adj.agentMergeKeys[0]!,
        impact,
        adj.showOnAgentReport,
        note,
        adj.supplierId,
        rates,
      );
    } else if (adj.resolutionType === 'agent_pro_rata' && adj.agentMergeKeys.length > 0) {
      const keys = adj.agentMergeKeys;
      const perAgent = roundMoney(impact / keys.length);
      let distributed = 0;
      keys.forEach((key, idx) => {
        const slice = idx === keys.length - 1 ? roundMoney(impact - distributed) : perAgent;
        distributed = roundMoney(distributed + slice);
        applyAgentDeduction(rowMap, key, slice, false, note, adj.supplierId, rates);
      });
    } else if (adj.resolutionType === 'agent_bonus' && adj.agentMergeKeys.length === 1) {
      applyAgentBonus(
        rowMap,
        adj.agentMergeKeys[0]!,
        impact,
        adj.showOnAgentReport,
        note,
        adj.supplierId,
        rates,
      );
    }
  }

  return [...rowMap.values()]
    .filter((row) => Math.abs(row.currentMonthOwed) > 0.001 || row.customers.length > 0)
    .map((row) => {
      const prior = rows.find((r) => r.agentId === row.agentId);
      return {
        ...(prior ?? row),
        ...row,
        company:
          row.company || displayNameForMergeKey(row.agentId, rates) || resolveAgentDisplayName(row.agentId),
      };
    }) as T[];
}

export function reconciliationDetailRow(
  adj: SupplierPeriodAdjustment,
  rates: BmwAgentRate[] = [],
): Record<string, unknown> {
  const agentLabel =
    adj.resolutionType === 'candid_revenue' || adj.resolutionType === 'candid_absorb'
      ? 'Candid Solutions'
      : adj.agentMergeKeys.map((k) => displayNameForMergeKey(k, rates)).join(', ') || null;
  return {
    'Deal UID': null,
    Customer: adj.note,
    'Product/Service': 'Reconciliation adjustment',
    Supplier: paySourceForSupplier(adj.supplierId),
    'Net Commission': adj.amount,
    Agent: agentLabel,
    'Agent Rate': null,
    'Agent Payout': null,
  };
}

export function validateReconciliationPayload(payload: {
  supplierId: SupplierId;
  period: string;
  amount: number;
  resolutionType: ReconciliationResolutionType;
  agentMergeKeys: string[];
  showOnAgentReport: boolean;
  note: string;
}): string | null {
  if (!payload.note.trim()) return 'A note is required.';
  if (Math.abs(payload.amount) <= RECONCILIATION_TOLERANCE) {
    return 'Adjustment amount must exceed the reconciliation tolerance.';
  }

  const isShortfall = payload.amount < 0;
  if (isShortfall && !SHORTFALL_RESOLUTIONS.includes(payload.resolutionType)) {
    return 'Invalid resolution for a deposit shortfall.';
  }
  if (!isShortfall && !OVERAGE_RESOLUTIONS.includes(payload.resolutionType)) {
    return 'Invalid resolution for a deposit overage.';
  }

  if (payload.resolutionType === 'agent_charge' || payload.resolutionType === 'agent_bonus') {
    if (payload.agentMergeKeys.length !== 1) return 'Select exactly one agent.';
  }
  if (payload.resolutionType === 'agent_pro_rata') {
    if (payload.agentMergeKeys.length < 1) return 'Select at least one agent for the split.';
  }

  return null;
}
