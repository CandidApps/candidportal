import { matchPeriodRows } from '@/lib/commissions/agent-commission-engine';
import { resolveAgentDisplayName, resolveAgentMergeKey } from '@/lib/bmw/deal-master';
import { agentCommissionPeriods, periodBefore } from '@/lib/commissions/period-utils';
import type { SupplierImportBatch } from '@/lib/commissions/supplier-config';
import type { InternalCommissionParticipant } from '@/lib/team/internal-participant-types';
import type { AgentSourcingRule, PartnerSplitShare } from '@/lib/services/internal-agent-sourcing-db';

export type HouseDealSummary = {
  dealUid: string;
  company: string;
  supplier: string;
  gross: number;
  agentPaid: number;
  houseNet: number;
  primaryAgentName: string;
  primaryAgentMergeKey: string;
};

export type TeamAttributedDealLine = {
  dealUid: string;
  company: string;
  supplier: string;
  gross: number;
  agentPaid: number;
  houseNet: number;
  sharePercent: number;
  amount: number;
  ruleLabel: string;
  primaryAgentName: string;
};

export type TeamPayoutRow = {
  profileId: string;
  displayName: string;
  email: string;
  participantType: InternalCommissionParticipant['participantType'];
  defaultHouseSharePercent: number;
  currentMonthOwed: number;
  lastMonthPaid: number;
  ytdPaid: number;
  dealCount: number;
  deals: TeamAttributedDealLine[];
};

type DealBucket = {
  dealUid: string;
  company: string;
  supplier: string;
  gross: number;
  agentPaid: number;
  primaryAgentCommId: string;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function activeParticipants(participants: InternalCommissionParticipant[]) {
  return participants.filter((p) => p.status === 'active' && p.participantType !== 'inactive');
}

function activePartners(participants: InternalCommissionParticipant[]) {
  return activeParticipants(participants).filter((p) => p.participantType === 'partner');
}

function activeEmployees(participants: InternalCommissionParticipant[]) {
  return activeParticipants(participants).filter((p) => p.participantType === 'internal_employee');
}

export function buildHouseDealSummaries(
  imports: SupplierImportBatch[],
  period: string,
): HouseDealSummary[] {
  const buckets = new Map<string, DealBucket>();

  for (const line of matchPeriodRows(imports, period)) {
    const existing = buckets.get(line.dealUid);
    if (!existing) {
      buckets.set(line.dealUid, {
        dealUid: line.dealUid,
        company: line.company,
        supplier: line.supplier,
        gross: line.supplierAmount,
        agentPaid: line.agentPayout,
        primaryAgentCommId: line.agentCommId,
      });
      continue;
    }
    existing.agentPaid = roundMoney(existing.agentPaid + line.agentPayout);
    if (line.supplierAmount > existing.gross) existing.gross = line.supplierAmount;
  }

  return [...buckets.values()]
    .map((b) => ({
      dealUid: b.dealUid,
      company: b.company,
      supplier: b.supplier,
      gross: b.gross,
      agentPaid: b.agentPaid,
      houseNet: roundMoney(Math.max(0, b.gross - b.agentPaid)),
      primaryAgentName: resolveAgentDisplayName(b.primaryAgentCommId),
      primaryAgentMergeKey: resolveAgentMergeKey(b.primaryAgentCommId),
    }))
    .filter((d) => d.houseNet > 0.001)
    .sort(
      (a, b) =>
        a.company.localeCompare(b.company, undefined, { sensitivity: 'base' }) ||
        a.supplier.localeCompare(b.supplier, undefined, { sensitivity: 'base' }),
    );
}

function partnerPercentTotal(partners: InternalCommissionParticipant[]): number {
  return partners.reduce((s, p) => s + Math.max(0, p.defaultHouseSharePercent), 0);
}

function sourcingRuleForDeal(
  deal: HouseDealSummary,
  sourcingRules: AgentSourcingRule[],
): AgentSourcingRule | null {
  if (!deal.primaryAgentMergeKey) return null;
  return sourcingRules.find((r) => r.agentMergeKey === deal.primaryAgentMergeKey) ?? null;
}

function partnerSharesForDeal(
  deal: HouseDealSummary,
  partners: InternalCommissionParticipant[],
  sourcingRules: AgentSourcingRule[],
): { shares: PartnerSplitShare[]; ruleLabel: string } {
  const rule = sourcingRuleForDeal(deal, sourcingRules);
  if (rule?.partnerSplits.length) {
    const label = rule.label?.trim() || `Sourced rule · ${deal.primaryAgentName}`;
    return { shares: rule.partnerSplits, ruleLabel: label };
  }
  return {
    shares: partners.map((p) => ({
      profileId: p.profileId,
      percent: Math.max(0, p.defaultHouseSharePercent),
    })),
    ruleLabel: 'Default partner split',
  };
}

function allocateHouseNetForDeal(
  deal: HouseDealSummary,
  participants: InternalCommissionParticipant[],
  sourcingRules: AgentSourcingRule[] = [],
): Map<string, TeamAttributedDealLine> {
  const out = new Map<string, TeamAttributedDealLine>();
  const employees = activeEmployees(participants);
  const partners = activePartners(participants);
  if (!employees.length && !partners.length) return out;

  let employeeTotal = 0;
  for (const emp of employees) {
    const rate = emp.houseShareRateOfNet ?? 0;
    if (rate <= 0) continue;
    const amount = roundMoney(deal.houseNet * (rate / 100));
    if (amount <= 0) continue;
    employeeTotal = roundMoney(employeeTotal + amount);
    out.set(emp.profileId, {
      dealUid: deal.dealUid,
      company: deal.company,
      supplier: deal.supplier,
      gross: deal.gross,
      agentPaid: deal.agentPaid,
      houseNet: deal.houseNet,
      sharePercent: rate,
      amount,
      ruleLabel: `${rate}% of house net`,
      primaryAgentName: deal.primaryAgentName,
    });
  }

  const partnerPool = roundMoney(Math.max(0, deal.houseNet - employeeTotal));
  const { shares, ruleLabel } = partnerSharesForDeal(deal, partners, sourcingRules);
  const totalPartnerPct = shares.reduce((s, p) => s + Math.max(0, p.percent), 0);
  if (partnerPool <= 0 || totalPartnerPct <= 0) return out;

  for (const share of shares) {
    const pct = Math.max(0, share.percent);
    if (pct <= 0) continue;
    const amount = roundMoney(partnerPool * (pct / totalPartnerPct));
    if (amount <= 0) continue;
    out.set(share.profileId, {
      dealUid: deal.dealUid,
      company: deal.company,
      supplier: deal.supplier,
      gross: deal.gross,
      agentPaid: deal.agentPaid,
      houseNet: deal.houseNet,
      sharePercent: roundMoney((pct / totalPartnerPct) * 100),
      amount,
      ruleLabel: `${ruleLabel} · ${pct}%`,
      primaryAgentName: deal.primaryAgentName,
    });
  }

  return out;
}

function sumPeriodOwed(
  imports: SupplierImportBatch[],
  period: string,
  participants: InternalCommissionParticipant[],
  sourcingRules: AgentSourcingRule[] = [],
): Map<string, { total: number; deals: TeamAttributedDealLine[] }> {
  const totals = new Map<string, { total: number; deals: TeamAttributedDealLine[] }>();
  const houseDeals = buildHouseDealSummaries(imports, period);

  for (const deal of houseDeals) {
    const allocations = allocateHouseNetForDeal(deal, participants, sourcingRules);
    for (const [profileId, line] of allocations) {
      const bucket = totals.get(profileId) ?? { total: 0, deals: [] };
      bucket.total = roundMoney(bucket.total + line.amount);
      bucket.deals.push(line);
      totals.set(profileId, bucket);
    }
  }

  return totals;
}

export function buildTeamPayoutRows(
  imports: SupplierImportBatch[],
  period: string,
  participants: InternalCommissionParticipant[],
  sourcingRules: AgentSourcingRule[] = [],
): TeamPayoutRow[] {
  const active = activeParticipants(participants);
  if (!active.length) return [];

  const current = sumPeriodOwed(imports, period, participants, sourcingRules);
  const prevPeriod = periodBefore(period);
  const lastMonth = sumPeriodOwed(imports, prevPeriod, participants, sourcingRules);

  const ytdPeriods = agentCommissionPeriods(period).filter(
    (p) => p <= period && p.startsWith(period.slice(0, 4)),
  );
  const ytdByProfile = new Map<string, number>();
  for (const p of ytdPeriods) {
    const periodTotals = sumPeriodOwed(imports, p, participants, sourcingRules);
    for (const [profileId, bucket] of periodTotals) {
      ytdByProfile.set(profileId, roundMoney((ytdByProfile.get(profileId) ?? 0) + bucket.total));
    }
  }

  return active
    .map((p) => {
      const cur = current.get(p.profileId);
      const prev = lastMonth.get(p.profileId);
      const deals = (cur?.deals ?? []).sort(
        (a, b) =>
          a.company.localeCompare(b.company, undefined, { sensitivity: 'base' }) ||
          a.supplier.localeCompare(b.supplier, undefined, { sensitivity: 'base' }),
      );
      return {
        profileId: p.profileId,
        displayName: p.displayName,
        email: p.email,
        participantType: p.participantType,
        defaultHouseSharePercent: p.defaultHouseSharePercent,
        currentMonthOwed: cur?.total ?? 0,
        lastMonthPaid: prev?.total ?? 0,
        ytdPaid: ytdByProfile.get(p.profileId) ?? 0,
        dealCount: deals.length,
        deals,
      };
    })
    .filter((row) => row.currentMonthOwed > 0.001 || row.dealCount > 0 || row.ytdPaid > 0.001)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
}

export function attributedDealsForMember(
  imports: SupplierImportBatch[],
  period: string,
  participants: InternalCommissionParticipant[],
  profileId: string,
  sourcingRules: AgentSourcingRule[] = [],
): TeamAttributedDealLine[] {
  const rows = buildTeamPayoutRows(imports, period, participants, sourcingRules);
  return rows.find((r) => r.profileId === profileId)?.deals ?? [];
}
