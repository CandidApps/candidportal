import {
  resolveAgentDisplayName,
  resolveAgentMergeKey,
} from '@/lib/bmw/deal-master';
import { paySourceForSupplier, supplierForPaySource } from '@/lib/bmw/pay-source-map';
import type { BmwAgentRate } from '@/lib/bmw/types';
import type { InternalCommissionParticipant } from '@/lib/team/internal-participant-types';
import type { TeamPayoutRow } from '@/lib/team/internal-commission-engine';

export const TEAM_PARTICIPANT_MERGE_PREFIX = 'team:';
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

function slicesForKeys(keys: string[], impact: number): Map<string, number> {
  const out = new Map<string, number>();
  if (!keys.length || impact <= 0) return out;
  const perKey = roundMoney(impact / keys.length);
  let distributed = 0;
  keys.forEach((key, idx) => {
    const slice = idx === keys.length - 1 ? roundMoney(impact - distributed) : perKey;
    distributed = roundMoney(distributed + slice);
    out.set(key, slice);
  });
  return out;
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
  role?: 'agent' | 'partner' | 'internal';
};

export function teamParticipantMergeKey(profileId: string): string {
  return `${TEAM_PARTICIPANT_MERGE_PREFIX}${profileId}`;
}

export function isTeamParticipantMergeKey(mergeKey: string): boolean {
  return mergeKey.startsWith(TEAM_PARTICIPANT_MERGE_PREFIX);
}

export function profileIdFromTeamMergeKey(mergeKey: string): string | null {
  if (!isTeamParticipantMergeKey(mergeKey)) return null;
  const profileId = mergeKey.slice(TEAM_PARTICIPANT_MERGE_PREFIX.length).trim();
  return profileId || null;
}

/** Active team partners/employees for reconcile selection (no BMW agent link required). */
export function buildSupplementalReconcileParticipants(
  participants: InternalCommissionParticipant[],
  rates: BmwAgentRate[],
): Array<{
  mergeKey: string;
  displayName: string;
  agentCommId: string;
  role?: 'agent' | 'partner' | 'internal';
}> {
  const rateByEmail = new Map<string, BmwAgentRate>();
  for (const rate of rates) {
    const email = rate.email?.trim().toLowerCase();
    if (email) rateByEmail.set(email, rate);
  }

  const out: Array<{
    mergeKey: string;
    displayName: string;
    agentCommId: string;
    role?: 'agent' | 'partner' | 'internal';
  }> = [];

  for (const participant of participants) {
    if (participant.status !== 'active') continue;
    if (
      participant.participantType !== 'partner'
      && participant.participantType !== 'internal_employee'
    ) {
      continue;
    }

    const role =
      participant.participantType === 'partner'
        ? ('partner' as const)
        : ('internal' as const);
    const roleLabel = role === 'partner' ? 'Partner' : 'Internal';

    if (participant.optionalAgentCommId) {
      out.push({
        mergeKey: resolveAgentMergeKey(participant.optionalAgentCommId),
        displayName: `${participant.displayName} (${roleLabel})`,
        agentCommId: participant.optionalAgentCommId,
        role,
      });
      continue;
    }

    const email = participant.email?.trim().toLowerCase();
    const matchedRate = email ? rateByEmail.get(email) : undefined;
    if (matchedRate) {
      out.push({
        mergeKey: resolveAgentMergeKey(matchedRate.id),
        displayName: `${participant.displayName} (${roleLabel})`,
        agentCommId: matchedRate.id,
        role,
      });
      continue;
    }

    out.push({
      mergeKey: teamParticipantMergeKey(participant.profileId),
      displayName: `${participant.displayName} (${roleLabel})`,
      agentCommId: teamParticipantMergeKey(participant.profileId),
      role,
    });
  }

  return out;
}

export function listSelectableAgents(
  rates: BmwAgentRate[],
  supplierId: SupplierId,
  period: string,
  opts?: {
    payingMergeKeys?: Set<string>;
    imports?: SupplierImportBatch[];
    supplementalAgents?: Array<{
      mergeKey: string;
      displayName: string;
      agentCommId: string;
      role?: 'agent' | 'partner' | 'internal';
    }>;
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
      role: 'agent',
    });
  }

  for (const item of opts?.supplementalAgents ?? []) {
    if (!item.mergeKey) continue;
    if (seen.has(item.mergeKey)) {
      if (item.role && item.role !== 'agent') {
        const existing = out.find((entry) => entry.mergeKey === item.mergeKey);
        if (existing) {
          existing.displayName = item.displayName;
          existing.role = item.role;
        }
      }
      continue;
    }
    seen.add(item.mergeKey);
    out.push({
      mergeKey: item.mergeKey,
      displayName: item.displayName,
      agentCommId: item.agentCommId,
      hasPayoutOnSupplier: paying.has(item.mergeKey),
      role: item.role ?? 'agent',
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

export function displayNameForMergeKey(
  mergeKey: string,
  rates: BmwAgentRate[] = [],
  participants: InternalCommissionParticipant[] = [],
): string {
  const profileId = profileIdFromTeamMergeKey(mergeKey);
  if (profileId) {
    const participant = participants.find((p) => p.profileId === profileId);
    if (participant) return participant.displayName;
  }
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
      const key = adj.agentMergeKeys[0]!;
      if (!isTeamParticipantMergeKey(key)) {
        applyAgentDeduction(
          rowMap,
          key,
          impact,
          adj.showOnAgentReport,
          note,
          adj.supplierId,
          rates,
        );
      }
    } else if (adj.resolutionType === 'agent_pro_rata' && adj.agentMergeKeys.length > 0) {
      const slices = slicesForKeys(adj.agentMergeKeys, impact);
      for (const [key, slice] of slices) {
        if (isTeamParticipantMergeKey(key)) continue;
        applyAgentDeduction(rowMap, key, slice, false, note, adj.supplierId, rates);
      }
    } else if (adj.resolutionType === 'agent_bonus' && adj.agentMergeKeys.length === 1) {
      const key = adj.agentMergeKeys[0]!;
      if (!isTeamParticipantMergeKey(key)) {
        applyAgentBonus(
          rowMap,
          key,
          impact,
          adj.showOnAgentReport,
          note,
          adj.supplierId,
          rates,
        );
      }
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

function ensureTeamRow(
  rowMap: Map<string, TeamPayoutRow>,
  profileId: string,
  participants: InternalCommissionParticipant[],
): TeamPayoutRow {
  const existing = rowMap.get(profileId);
  if (existing) return existing;

  const participant = participants.find((p) => p.profileId === profileId);
  const created: TeamPayoutRow = {
    profileId,
    displayName: participant?.displayName ?? 'Team member',
    email: participant?.email ?? '',
    participantType: participant?.participantType ?? 'partner',
    defaultHouseSharePercent: participant?.defaultHouseSharePercent ?? 0,
    currentMonthOwed: 0,
    lastMonthPaid: 0,
    ytdPaid: 0,
    dealCount: 0,
    deals: [],
  };
  rowMap.set(profileId, created);
  return created;
}

function applyTeamDeduction(
  rowMap: Map<string, TeamPayoutRow>,
  profileId: string,
  amount: number,
  showOnReport: boolean,
  note: string,
  supplierId: SupplierId,
  participants: InternalCommissionParticipant[],
): void {
  if (amount <= 0) return;
  const row = ensureTeamRow(rowMap, profileId, participants);
  const supplierLabel = SUPPLIER_LABELS[supplierId];

  if (showOnReport) {
    row.deals.push({
      dealUid: `recon-${supplierId}-${profileId}-${note.slice(0, 16)}`,
      company: note,
      supplier: supplierLabel,
      gross: 0,
      agentPaid: 0,
      houseNet: -roundMoney(amount),
      sharePercent: 100,
      amount: -roundMoney(amount),
      ruleLabel: note,
      primaryAgentName: '',
    });
    row.dealCount = row.deals.length;
    row.currentMonthOwed = roundMoney(row.currentMonthOwed - amount);
    return;
  }

  let remaining = amount;
  for (const deal of row.deals) {
    if (remaining <= 0) break;
    if (deal.amount <= 0) continue;
    const take = Math.min(deal.amount, remaining);
    deal.amount = roundMoney(deal.amount - take);
    deal.houseNet = roundMoney(Math.max(0, deal.houseNet - take));
    remaining = roundMoney(remaining - take);
  }
  row.currentMonthOwed = roundMoney(row.currentMonthOwed - amount);
  row.deals = row.deals.filter((d) => Math.abs(d.amount) > 0.001);
  row.dealCount = row.deals.length;
}

function applyTeamBonus(
  rowMap: Map<string, TeamPayoutRow>,
  profileId: string,
  amount: number,
  showOnReport: boolean,
  note: string,
  supplierId: SupplierId,
  participants: InternalCommissionParticipant[],
): void {
  if (amount <= 0) return;
  const row = ensureTeamRow(rowMap, profileId, participants);
  const supplierLabel = SUPPLIER_LABELS[supplierId];

  if (showOnReport) {
    row.deals.push({
      dealUid: `recon-${supplierId}-${profileId}-${note.slice(0, 16)}`,
      company: note,
      supplier: supplierLabel,
      gross: 0,
      agentPaid: 0,
      houseNet: roundMoney(amount),
      sharePercent: 100,
      amount: roundMoney(amount),
      ruleLabel: note,
      primaryAgentName: '',
    });
    row.dealCount = row.deals.length;
  }
  row.currentMonthOwed = roundMoney(row.currentMonthOwed + amount);
}

/** Apply supplier reconciliation adjustments to internal team payout rows. */
export function applyReconciliationToTeamRows(
  rows: TeamPayoutRow[],
  adjustments: SupplierPeriodAdjustment[],
  period: string,
  participants: InternalCommissionParticipant[] = [],
): TeamPayoutRow[] {
  const periodAdjustments = adjustments.filter((a) => a.period === period);
  if (!periodAdjustments.length) return rows;

  const rowMap = new Map<string, TeamPayoutRow>(
    rows.map((row) => [row.profileId, { ...row, deals: [...row.deals] }]),
  );

  for (const adj of periodAdjustments) {
    const impact = Math.abs(adj.amount);
    if (impact <= RECONCILIATION_TOLERANCE) continue;
    if (adj.resolutionType === 'candid_revenue' || adj.resolutionType === 'candid_absorb') {
      continue;
    }

    const note = adj.note.trim() || `${SUPPLIER_LABELS[adj.supplierId]} reconciliation`;
    const teamKeys = adj.agentMergeKeys
      .map((key) => profileIdFromTeamMergeKey(key))
      .filter((id): id is string => !!id);

    if (adj.resolutionType === 'agent_charge' && teamKeys.length === 1) {
      applyTeamDeduction(
        rowMap,
        teamKeys[0]!,
        impact,
        adj.showOnAgentReport,
        note,
        adj.supplierId,
        participants,
      );
    } else if (adj.resolutionType === 'agent_pro_rata' && adj.agentMergeKeys.length > 0) {
      const slices = slicesForKeys(adj.agentMergeKeys, impact);
      for (const [key, slice] of slices) {
        const profileId = profileIdFromTeamMergeKey(key);
        if (!profileId) continue;
        applyTeamDeduction(rowMap, profileId, slice, false, note, adj.supplierId, participants);
      }
    } else if (adj.resolutionType === 'agent_bonus' && teamKeys.length === 1) {
      applyTeamBonus(
        rowMap,
        teamKeys[0]!,
        impact,
        adj.showOnAgentReport,
        note,
        adj.supplierId,
        participants,
      );
    }
  }

  return [...rowMap.values()]
    .filter((row) => Math.abs(row.currentMonthOwed) > 0.001 || row.deals.length > 0)
    .map((row) => {
      const prior = rows.find((r) => r.profileId === row.profileId);
      return { ...(prior ?? row), ...row };
    });
}

export function reconciliationDetailRow(
  adj: SupplierPeriodAdjustment,
  rates: BmwAgentRate[] = [],
  participants: InternalCommissionParticipant[] = [],
): Record<string, unknown> {
  const agentLabel =
    adj.resolutionType === 'candid_revenue' || adj.resolutionType === 'candid_absorb'
      ? 'Candid Solutions'
      : adj.agentMergeKeys.map((k) => displayNameForMergeKey(k, rates, participants)).join(', ') || null;
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
    if (payload.agentMergeKeys.length !== 1) return 'Select exactly one agent or partner.';
  }
  if (payload.resolutionType === 'agent_pro_rata') {
    if (payload.agentMergeKeys.length < 1) return 'Select at least one agent or partner for the split.';
  }

  return null;
}
