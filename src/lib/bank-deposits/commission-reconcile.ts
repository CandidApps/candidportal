import type { ParsedChaseRow } from '@/lib/bank-deposits/chase-parse';
import { normalizeDepositType } from '@/lib/bank-deposits/chase-parse';
import type { SourceMatchResult } from '@/lib/bank-deposits/source-match';
import { inferSourceMatch, type PartnerSupplierRecord } from '@/lib/bank-deposits/source-match';
import type { SupplierId, SupplierImportBatch } from '@/lib/commissions/supplier-config';

export type DepositMatchStatus =
  | 'matched'
  | 'mismatch'
  | 'no_commission_data'
  | 'no_deposit'
  | 'na'
  | 'pending';

export type BankDepositPreviewRow = ParsedChaseRow & {
  depositType: string;
  sourceMatch: SourceMatchResult;
  supplierKey: SupplierId | null;
  partnerId: number | null;
  sourceMatchLabel: string;
  supplierCommissionAmount: number | null;
  matchStatus: DepositMatchStatus;
  variance: number | null;
};

const MATCH_TOLERANCE = 0.02;

function supplierPeriodTotals(
  imports: SupplierImportBatch[],
  supplier: SupplierId,
  period: string,
): number {
  return imports
    .filter((i) => i.supplier === supplier && i.period === period)
    .reduce((s, i) => s + i.totalAmount, 0);
}

function groupKey(supplierKey: SupplierId | null, period: string | null, label: string): string {
  return `${supplierKey ?? label}::${period ?? 'unknown'}`;
}

export function reconcileBankDeposits(
  rows: ParsedChaseRow[],
  sourceMatches: Array<{ row: ParsedChaseRow; match: SourceMatchResult; depositType: string }>,
  commissionImports: SupplierImportBatch[],
): BankDepositPreviewRow[] {
  type Group = {
    supplierKey: SupplierId | null;
    period: string | null;
    label: string;
    netAmount: number;
    lineIndexes: number[];
    isCommission: boolean;
  };

  const groups = new Map<string, Group>();

  for (const { row, match, depositType } of sourceMatches) {
    const isCommission = depositType === 'Commission';
    const key = groupKey(match.supplierKey, row.commissionPeriod, match.sourceMatchLabel);
    const group = groups.get(key) ?? {
      supplierKey: match.supplierKey,
      period: row.commissionPeriod,
      label: match.sourceMatchLabel,
      netAmount: 0,
      lineIndexes: [],
      isCommission,
    };
    group.netAmount += row.amount;
    group.lineIndexes.push(row.lineIndex);
    group.isCommission = group.isCommission || isCommission;
    groups.set(key, group);
  }

  const groupStatus = new Map<string, { status: DepositMatchStatus; expected: number | null; variance: number | null }>();

  for (const [key, group] of groups) {
    if (!group.isCommission || !group.supplierKey || !group.period) {
      groupStatus.set(key, { status: 'na', expected: null, variance: null });
      continue;
    }

    const expected = supplierPeriodTotals(commissionImports, group.supplierKey, group.period);
    if (expected === 0) {
      const hasBatch = commissionImports.some(
        (b) => b.supplier === group.supplierKey && b.period === group.period,
      );
      groupStatus.set(key, {
        status: hasBatch ? 'mismatch' : 'no_commission_data',
        expected: hasBatch ? expected : null,
        variance: hasBatch ? group.netAmount - expected : null,
      });
      continue;
    }

    const variance = Math.round((group.netAmount - expected) * 100) / 100;
    const status: DepositMatchStatus =
      Math.abs(variance) <= MATCH_TOLERANCE ? 'matched' : 'mismatch';
    groupStatus.set(key, { status, expected, variance });
  }

  return sourceMatches.map(({ row, match, depositType }) => {
    const key = groupKey(match.supplierKey, row.commissionPeriod, match.sourceMatchLabel);
    const group = groups.get(key)!;
    const statusInfo = groupStatus.get(key)!;

    let matchStatus = statusInfo.status;
    let supplierCommissionAmount = statusInfo.expected;
    let variance = statusInfo.variance;

    if (depositType !== 'Commission') {
      matchStatus = 'na';
      supplierCommissionAmount = null;
      variance = null;
    } else if (!match.supplierKey) {
      matchStatus = 'pending';
      supplierCommissionAmount = null;
      variance = null;
    } else if (group.lineIndexes.length === 1 && statusInfo.expected != null) {
      variance = Math.round((row.amount - statusInfo.expected) * 100) / 100;
      matchStatus =
        statusInfo.expected === 0 && !commissionImports.some(
          (b) => b.supplier === match.supplierKey && b.period === row.commissionPeriod,
        )
          ? 'no_commission_data'
          : Math.abs(variance) <= MATCH_TOLERANCE
            ? 'matched'
            : 'mismatch';
      supplierCommissionAmount = statusInfo.expected;
    }

    return {
      ...row,
      depositType,
      sourceMatch: match,
      supplierKey: match.supplierKey,
      partnerId: match.partnerId,
      sourceMatchLabel: match.sourceMatchLabel,
      supplierCommissionAmount,
      matchStatus,
      variance,
    };
  });
}

export function buildPreviewRows(
  parsed: ParsedChaseRow[],
  partners: PartnerSupplierRecord[],
  commissionImports: SupplierImportBatch[],
): BankDepositPreviewRow[] {
  const sourceMatches = parsed.map((row) => {
    const match = inferSourceMatch(row, partners);
    const depositType = row.sheetType ? normalizeDepositType(row.sheetType) : 'Commission';
    return { row, match, depositType };
  });

  return reconcileBankDeposits(parsed, sourceMatches, commissionImports);
}
