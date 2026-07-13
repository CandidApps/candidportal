import type { SupplierImportBatch } from '@/lib/commissions/supplier-config';
import { dealServiceTitleForUid } from '@/lib/customer-contracts-from-deals';
import type { InternalDealSplit } from '@/lib/services/internal-deal-splits-db';
import type { InternalCommissionParticipant } from '@/lib/team/internal-participant-types';
import {
  allocateHouseNetForDeal,
  buildHouseDealSummaries,
  describeDealSplit,
  type HouseDealSummary,
  type TeamAttributedDealLine,
} from '@/lib/team/internal-commission-engine';

export const TEAM_PAYOUT_COLORS = [
  '#22b8a0',
  '#4d7cfe',
  '#9b6bf0',
  '#ef4060',
  '#f5a623',
  '#565a6b',
] as const;

export type TeamSplitRecipient = {
  profileId: string;
  displayName: string;
  amount: number;
  sharePercent: number;
  participantType: InternalCommissionParticipant['participantType'];
  color: string;
};

export type TeamSplitLedgerDeal = {
  key: string;
  dealUid: string;
  company: string;
  supplier: string;
  serviceTitle: string | null;
  gross: number;
  agentPaid: number;
  houseNet: number;
  primaryAgentName: string;
  primaryAgentMergeKey: string | null;
  agentRatePercent: number | null;
  splitLabel: string;
  splitPercents: number[];
  recipients: TeamSplitRecipient[];
  splitReason: string;
  hasDealOverride: boolean;
  kind: 'commission' | 'expense' | 'reconciliation';
};

export type TeamSplitLedgerVendorGroup = {
  supplier: string;
  dealCount: number;
  grossTotal: number;
  houseNetTotal: number;
  deals: TeamSplitLedgerDeal[];
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function activeParticipants(participants: InternalCommissionParticipant[]) {
  return participants.filter((p) => p.status === 'active' && p.participantType !== 'inactive');
}

function colorForProfile(profileId: string, participants: InternalCommissionParticipant[]): string {
  const active = activeParticipants(participants);
  const idx = active.findIndex((p) => p.profileId === profileId);
  return TEAM_PAYOUT_COLORS[(idx >= 0 ? idx : 0) % TEAM_PAYOUT_COLORS.length]!;
}

function ledgerDealFromHouse(
  deal: HouseDealSummary,
  participants: InternalCommissionParticipant[],
  dealSplitOverrides: InternalDealSplit[],
): TeamSplitLedgerDeal {
  const allocations = allocateHouseNetForDeal(deal, participants, dealSplitOverrides);
  const { splitLabel, splitPercents, splitReason, hasDealOverride } = describeDealSplit(
    deal,
    participants,
    dealSplitOverrides,
  );

  const recipients: TeamSplitRecipient[] = [...allocations.entries()]
    .map(([profileId, line]) => {
      const participant = participants.find((p) => p.profileId === profileId);
      return {
        profileId,
        displayName: participant?.displayName ?? profileId,
        amount: line.amount,
        sharePercent: line.sharePercent,
        participantType: participant?.participantType ?? 'partner',
        color: colorForProfile(profileId, participants),
      };
    })
    .sort((a, b) => {
      if (a.participantType === 'internal_employee' && b.participantType !== 'internal_employee') {
        return -1;
      }
      if (b.participantType === 'internal_employee' && a.participantType !== 'internal_employee') {
        return 1;
      }
      return b.amount - a.amount;
    });

  const agentRatePercent =
    deal.agentPaid > 0.001 && deal.gross > 0
      ? roundMoney((deal.agentPaid / deal.gross) * 100)
      : null;

  return {
    key: `${deal.dealUid}-${deal.supplier}`,
    dealUid: deal.dealUid,
    company: deal.company,
    supplier: deal.supplier,
    serviceTitle: dealServiceTitleForUid(deal.dealUid),
    gross: deal.gross,
    agentPaid: deal.agentPaid,
    houseNet: deal.houseNet,
    primaryAgentName: deal.primaryAgentName,
    primaryAgentMergeKey: deal.primaryAgentMergeKey || null,
    agentRatePercent,
    splitLabel,
    splitPercents,
    recipients,
    splitReason,
    hasDealOverride,
    kind: 'commission',
  };
}

export type TeamLedgerAdjustmentEntry = {
  line: TeamAttributedDealLine;
  profileId: string;
  displayName: string;
  participantType: InternalCommissionParticipant['participantType'];
};

function ledgerDealFromAdjustment(
  entry: TeamLedgerAdjustmentEntry,
  participants: InternalCommissionParticipant[],
): TeamSplitLedgerDeal {
  const { line, profileId, displayName, participantType } = entry;
  const isExpense = line.supplier === 'Expense';

  return {
    key: line.dealUid,
    dealUid: line.dealUid,
    company: line.company,
    supplier: isExpense ? 'Adjustments' : line.supplier,
    serviceTitle: null,
    gross: line.gross,
    agentPaid: line.agentPaid,
    houseNet: line.houseNet,
    primaryAgentName: line.primaryAgentName,
    primaryAgentMergeKey: null,
    agentRatePercent: null,
    splitLabel: '—',
    splitPercents: [],
    recipients: [
      {
        profileId,
        displayName,
        amount: line.amount,
        sharePercent: line.sharePercent,
        participantType,
        color: colorForProfile(profileId, participants),
      },
    ],
    splitReason: line.ruleLabel,
    hasDealOverride: false,
    kind: isExpense ? 'expense' : 'reconciliation',
  };
}

/** Build vendor-grouped split ledger rows for the team payouts UI. */
export function buildTeamSplitLedger(
  imports: SupplierImportBatch[],
  period: string,
  participants: InternalCommissionParticipant[],
  dealSplitOverrides: InternalDealSplit[] = [],
  adjustmentEntries: TeamLedgerAdjustmentEntry[] = [],
): TeamSplitLedgerVendorGroup[] {
  const bySupplier = new Map<string, TeamSplitLedgerDeal[]>();

  for (const deal of buildHouseDealSummaries(imports, period)) {
    const row = ledgerDealFromHouse(deal, participants, dealSplitOverrides);
    const list = bySupplier.get(deal.supplier) ?? [];
    list.push(row);
    bySupplier.set(deal.supplier, list);
  }

  for (const entry of adjustmentEntries) {
    const { line } = entry;
    if (
      line.dealUid.startsWith('expense-') ||
      line.supplier === 'Expense' ||
      line.dealUid.includes('reconciliation')
    ) {
      const row = ledgerDealFromAdjustment(entry, participants);
      const list = bySupplier.get(row.supplier) ?? [];
      list.push(row);
      bySupplier.set(row.supplier, list);
    }
  }

  return [...bySupplier.entries()]
    .map(([supplier, deals]) => ({
      supplier,
      dealCount: deals.length,
      grossTotal: roundMoney(deals.reduce((s, d) => s + d.gross, 0)),
      houseNetTotal: roundMoney(deals.reduce((s, d) => s + d.houseNet, 0)),
      deals: deals.sort(
        (a, b) =>
          a.company.localeCompare(b.company, undefined, { sensitivity: 'base' }) ||
          a.supplier.localeCompare(b.supplier, undefined, { sensitivity: 'base' }),
      ),
    }))
    .sort((a, b) => {
      if (a.supplier === 'Adjustments') return 1;
      if (b.supplier === 'Adjustments') return -1;
      return a.supplier.localeCompare(b.supplier, undefined, { sensitivity: 'base' });
    });
}

export function teamPayoutRoleSubtitle(
  row: {
    profileId: string;
    participantType: InternalCommissionParticipant['participantType'];
    defaultHouseSharePercent: number;
    dealCount: number;
  },
  participants: InternalCommissionParticipant[],
): string {
  if (row.participantType === 'internal_employee') {
    const dealLabel = row.dealCount === 1 ? '1 deal this month' : `${row.dealCount} deals this month`;
    const rate =
      participants.find((p) => p.profileId === row.profileId)?.houseShareRateOfNet ?? 0;
    return `Employee · ${rate}% of house net · ${dealLabel}`;
  }

  const partners = participants.filter(
    (p) => p.participantType === 'partner' && p.status === 'active',
  );
  const splitLabel = partners
    .map((p) => Math.round(Math.max(0, p.defaultHouseSharePercent)))
    .filter((n) => n > 0)
    .join('/');
  return `Partner · house split ${splitLabel || `${row.defaultHouseSharePercent}%`}`;
}

export function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}
