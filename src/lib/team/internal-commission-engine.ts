import { normalizeUid } from '@/lib/bmw/deal-key';
import { matchPeriodRows } from '@/lib/commissions/agent-commission-engine';
import { resolveAgentDisplayName, resolveAgentMergeKey } from '@/lib/bmw/deal-master';
import { agentCommissionPeriods, periodBefore } from '@/lib/commissions/period-utils';
import type { SupplierImportBatch } from '@/lib/commissions/supplier-config';
import type {
  DealEmployeeSplit,
  InternalDealSplit,
  PartnerSplitShare,
} from '@/lib/services/internal-deal-splits-db';
import type { InternalCommissionParticipant } from '@/lib/team/internal-participant-types';

export type { DealEmployeeSplit, InternalDealSplit, PartnerSplitShare };

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

export type DealSplitPresentation = {
  splitLabel: string;
  splitPercents: number[];
  splitReason: string;
  hasDealOverride: boolean;
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

export function dealSplitOverrideFor(
  dealUid: string,
  dealSplitOverrides: InternalDealSplit[],
): InternalDealSplit | null {
  const key = normalizeUid(dealUid);
  if (!key) return null;
  return dealSplitOverrides.find((s) => normalizeUid(s.dealUid) === key) ?? null;
}

function employeeRateForDeal(
  employee: InternalCommissionParticipant,
  override: InternalDealSplit | null,
): number {
  if (override) {
    const match = override.employeeSplits.find((s) => s.profileId === employee.profileId);
    return Math.max(0, match?.percent ?? 0);
  }
  return Math.max(0, employee.houseShareRateOfNet ?? 0);
}

function partnerSharesForDeal(
  partners: InternalCommissionParticipant[],
  override: InternalDealSplit | null,
): { shares: PartnerSplitShare[]; ruleLabel: string } {
  if (override?.partnerSplits.length) {
    const label = override.label?.trim() || 'Custom deal split';
    return { shares: override.partnerSplits, ruleLabel: label };
  }
  return {
    shares: partners.map((p) => ({
      profileId: p.profileId,
      percent: Math.max(0, p.defaultHouseSharePercent),
    })),
    ruleLabel: 'Default partner split',
  };
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

export function allocateHouseNetForDeal(
  deal: HouseDealSummary,
  participants: InternalCommissionParticipant[],
  dealSplitOverrides: InternalDealSplit[] = [],
): Map<string, TeamAttributedDealLine> {
  const out = new Map<string, TeamAttributedDealLine>();
  const employees = activeEmployees(participants);
  const partners = activePartners(participants);
  if (!employees.length && !partners.length) return out;

  const override = dealSplitOverrideFor(deal.dealUid, dealSplitOverrides);

  let employeeTotal = 0;
  for (const emp of employees) {
    const rate = employeeRateForDeal(emp, override);
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
      ruleLabel: override
        ? `${rate}% of house net (deal override)`
        : `${rate}% of house net`,
      primaryAgentName: deal.primaryAgentName,
    });
  }

  const partnerPool = roundMoney(Math.max(0, deal.houseNet - employeeTotal));
  const { shares, ruleLabel } = partnerSharesForDeal(partners, override);
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

export function describeDealSplit(
  deal: HouseDealSummary,
  participants: InternalCommissionParticipant[],
  dealSplitOverrides: InternalDealSplit[] = [],
): DealSplitPresentation {
  const override = dealSplitOverrideFor(deal.dealUid, dealSplitOverrides);
  const employees = activeEmployees(participants);
  const partners = activePartners(participants);
  const { shares, ruleLabel } = partnerSharesForDeal(partners, override);

  const employeeRates = employees
    .map((e) => Math.round(employeeRateForDeal(e, override)))
    .filter((r) => r > 0);
  const partnerRates = shares.map((s) => Math.round(Math.max(0, s.percent))).filter((r) => r > 0);
  const splitPercents = [...employeeRates, ...partnerRates];
  const splitLabel = splitPercents.length ? splitPercents.join('/') : '—';

  const parts: string[] = [];
  if (override) {
    parts.push(
      override.label?.trim()
        ? `Custom split for this deal: ${override.label.trim()}.`
        : 'Custom split configured for this deal.',
    );
  } else {
    parts.push('Default house split applies until you override this deal.');
  }

  if (employeeRates.length) {
    const named = employees
      .filter((e) => employeeRateForDeal(e, override) > 0)
      .map((e) => e.displayName);
    parts.push(
      `${named.join(', ')} take${named.length === 1 ? 's' : ''} ${employeeRates.join('/')}% of house net before the partner split.`,
    );
  }

  if (deal.primaryAgentName && deal.agentPaid > 0.001) {
    parts.push(`External agent ${deal.primaryAgentName} received their payout. ${ruleLabel}.`);
  } else {
    parts.push('Direct deal — no external agent payout.');
  }

  return {
    splitLabel,
    splitPercents,
    splitReason: parts.join(' '),
    hasDealOverride: Boolean(override),
  };
}

function sumPeriodOwed(
  imports: SupplierImportBatch[],
  period: string,
  participants: InternalCommissionParticipant[],
  dealSplitOverrides: InternalDealSplit[] = [],
): Map<string, { total: number; deals: TeamAttributedDealLine[] }> {
  const totals = new Map<string, { total: number; deals: TeamAttributedDealLine[] }>();
  const houseDeals = buildHouseDealSummaries(imports, period);

  for (const deal of houseDeals) {
    const allocations = allocateHouseNetForDeal(deal, participants, dealSplitOverrides);
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
  dealSplitOverrides: InternalDealSplit[] = [],
): TeamPayoutRow[] {
  const active = activeParticipants(participants);
  if (!active.length) return [];

  const current = sumPeriodOwed(imports, period, participants, dealSplitOverrides);
  const prevPeriod = periodBefore(period);
  const lastMonth = sumPeriodOwed(imports, prevPeriod, participants, dealSplitOverrides);

  const ytdPeriods = agentCommissionPeriods(period).filter(
    (p) => p <= period && p.startsWith(period.slice(0, 4)),
  );
  const ytdByProfile = new Map<string, number>();
  for (const p of ytdPeriods) {
    const periodTotals = sumPeriodOwed(imports, p, participants, dealSplitOverrides);
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
  dealSplitOverrides: InternalDealSplit[] = [],
): TeamAttributedDealLine[] {
  const rows = buildTeamPayoutRows(imports, period, participants, dealSplitOverrides);
  return rows.find((r) => r.profileId === profileId)?.deals ?? [];
}
