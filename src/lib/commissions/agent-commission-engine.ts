import { getAddedDeal, getAddedDeals, addedDealToBmwDeal } from '@/lib/bmw/added-deals';
import {
  agentCommIdForDeal,
  commissionRateForAgent,
  syncCurrentPeriodSnapshot,
} from '@/lib/bmw/agent-comm-history';
import { matchDealToCommissionRow } from '@/lib/bmw/commission-match';
import {
  rebuildAgentRateIndex,
  resolveAgentDisplayName,
  resolveAgentEmail,
  resolveAgentMergeKey,
  getBmwDeals,
} from '@/lib/bmw/deal-master';
import { normalizeUid } from '@/lib/bmw/deal-key';
import { paySourceForSupplier } from '@/lib/bmw/pay-source-map';
import {
  computeAgentPayout,
  isAgentPayableForPeriod,
} from '@/lib/agents/agent-lifecycle';
import { overridePayoutLinesForDeal } from '@/lib/agents/agent-override-partners';
import type {
  AgentCommissionCustomer,
  AgentCommissionRow,
} from '@/lib/commissions/commission-store';
import {
  currentPeriod,
  periodBefore,
  agentCommissionPeriods,
} from '@/lib/commissions/period-utils';
import { isDealExcludedFromPayout } from '@/lib/commissions/escalate-commissions';
import type { SupplierId, SupplierImportBatch } from '@/lib/commissions/supplier-config';
import { commissionRowAmountForBatch } from '@/lib/commissions/supplier-config';
import { paySourceVerifiedEntriesForPeriod } from '@/lib/commissions/verify-commissions';
import { canonicalPaySource } from '@/lib/commission-partners';
import type { BmwDeal } from '@/lib/bmw/types';

type MatchedLine = {
  agentCommId: string;
  company: string;
  supplier: string;
  supplierAmount: number;
  agentPayout: number;
  commissionRate: number;
  dealUid: string;
};

function findDealByUid(dealUid: string): BmwDeal | null {
  const key = normalizeUid(dealUid);
  if (!key) return null;
  for (const deal of getBmwDeals()) {
    if (normalizeUid(deal.dealUid) === key) return deal;
  }
  for (const added of getAddedDeals()) {
    if (normalizeUid(added.dealUid) === key) return addedDealToBmwDeal(added);
  }
  return null;
}

function pushMatchedLine(
  lines: MatchedLine[],
  deal: BmwDeal,
  supplierLabel: string,
  supplierAmount: number,
  period: string,
  supplierId?: SupplierId,
): void {
  if (supplierId && isDealExcludedFromPayout(supplierId, period, deal.dealUid)) {
    return;
  }
  if (supplierAmount === 0) return;

  const added = supplierId ? getAddedDeal(supplierId, deal.dealUid) : undefined;
  const agentCommId = agentCommIdForDeal(deal, period) || added?.agentCommId || deal.agentCommId || '';
  if (!agentCommId) return;

  const primaryPayable = isAgentPayableForPeriod(agentCommId, period);
  const overrideLines = overridePayoutLinesForDeal(supplierAmount, agentCommId, period);

  if (!primaryPayable) {
    for (const overrideLine of overrideLines) {
      lines.push({
        agentCommId: overrideLine.overrideCommId,
        company: deal.merchant || 'Unknown merchant',
        supplier: supplierLabel,
        supplierAmount,
        agentPayout: overrideLine.overridePayout,
        commissionRate: overrideLine.overrideRate,
        dealUid: deal.dealUid,
      });
    }
    return;
  }

  const ratePct = added?.commissionRate ?? commissionRateForAgent(agentCommId, period);
  const primaryPayout = computeAgentPayout(supplierAmount, agentCommId, period, ratePct);

  if (Math.abs(primaryPayout) > 0.001) {
    lines.push({
      agentCommId,
      company: deal.merchant || 'Unknown merchant',
      supplier: supplierLabel,
      supplierAmount,
      agentPayout: primaryPayout,
      commissionRate: ratePct,
      dealUid: deal.dealUid,
    });
  }

  for (const overrideLine of overrideLines) {
    if (Math.abs(overrideLine.overridePayout) <= 0.001) continue;
    lines.push({
      agentCommId: overrideLine.overrideCommId,
      company: deal.merchant || 'Unknown merchant',
      supplier: supplierLabel,
      supplierAmount,
      agentPayout: overrideLine.overridePayout,
      commissionRate: overrideLine.overrideRate,
      dealUid: deal.dealUid,
    });
  }
}

function matchPaySourceVerifiedLines(period: string): MatchedLine[] {
  const lines: MatchedLine[] = [];
  for (const entry of paySourceVerifiedEntriesForPeriod(period)) {
    const supplierLabel = canonicalPaySource(entry.sourceLabel);
    for (const line of entry.lines) {
      const deal = findDealByUid(line.dealUid);
      if (!deal) continue;
      pushMatchedLine(lines, deal, supplierLabel, line.amount, period);
    }
  }
  return lines;
}

export function matchPeriodRows(
  imports: SupplierImportBatch[],
  period: string,
): MatchedLine[] {
  const lines: MatchedLine[] = [];

  for (const batch of imports) {
    if (batch.period !== period) continue;

    for (const row of batch.rows) {
      const deal = matchDealToCommissionRow(batch.supplier, row);
      if (!deal) continue;
      const supplierAmount = commissionRowAmountForBatch(batch, row);
      pushMatchedLine(
        lines,
        deal,
        paySourceForSupplier(batch.supplier),
        supplierAmount,
        period,
        batch.supplier,
      );
    }
  }

  lines.push(...matchPaySourceVerifiedLines(period));

  return lines;
}

function buildAgentRow(
  mergeKey: string,
  agentLines: MatchedLine[],
  period: string,
  linesByPeriod: Map<string, MatchedLine[]>,
): AgentCommissionRow {
  const currentMonthOwed = agentLines.reduce((s, l) => s + l.agentPayout, 0);
  const primaryCommId = agentLines[0]!.agentCommId;

  const customers: AgentCommissionCustomer[] = agentLines
    .map((l, idx) => ({
      id: `${mergeKey}-${l.dealUid}-${idx}`,
      company: l.company,
      supplier: l.supplier,
      amount: l.agentPayout,
      commissionRate: l.commissionRate,
      sourceAmount: l.supplierAmount,
      grossResidual: l.agentPayout,
      lineKind: 'commission' as const,
    }))
    .sort(
      (a, b) =>
        a.supplier.localeCompare(b.supplier, undefined, { sensitivity: 'base' }) ||
        a.company.localeCompare(b.company, undefined, { sensitivity: 'base' }),
    );

  const prevPeriod = periodBefore(period);
  const lastMonthLines = (linesByPeriod.get(prevPeriod) ?? []).filter(
    (l) => resolveAgentMergeKey(l.agentCommId) === mergeKey,
  );
  const lastMonthPaid = lastMonthLines.reduce((s, l) => s + l.agentPayout, 0);

  const ytdPeriods = agentCommissionPeriods(period).filter(
    (p) => p <= period && p.startsWith(period.slice(0, 4)),
  );

  let ytdPaid = 0;
  for (const p of ytdPeriods) {
    const periodLines = (linesByPeriod.get(p) ?? []).filter(
      (l) => resolveAgentMergeKey(l.agentCommId) === mergeKey,
    );
    ytdPaid += periodLines.reduce((s, l) => s + l.agentPayout, 0);
  }

  return {
    agentId: mergeKey,
    company: resolveAgentDisplayName(primaryCommId),
    contactEmail: resolveAgentEmail(primaryCommId),
    currentMonthOwed: Math.round(currentMonthOwed * 100) / 100,
    lastMonthPaid: Math.round(lastMonthPaid * 100) / 100,
    ytdPaid: Math.round(ytdPaid * 100) / 100,
    customers,
  };
}

function aggregateAgentRows(
  lines: MatchedLine[],
  period: string,
  linesByPeriod: Map<string, MatchedLine[]>,
): AgentCommissionRow[] {
  const byAgent = new Map<string, MatchedLine[]>();
  for (const line of lines) {
    const mergeKey = resolveAgentMergeKey(line.agentCommId);
    const list = byAgent.get(mergeKey) ?? [];
    list.push(line);
    byAgent.set(mergeKey, list);
  }

  return [...byAgent.entries()]
    .map(([mergeKey, agentLines]) => buildAgentRow(mergeKey, agentLines, period, linesByPeriod))
    .sort((a, b) => a.company.localeCompare(b.company, undefined, { sensitivity: 'base' }));
}

export function buildMatchedLinesByPeriod(
  imports: SupplierImportBatch[],
  periods: string[],
): Map<string, MatchedLine[]> {
  const linesByPeriod = new Map<string, MatchedLine[]>();
  for (const p of periods) {
    linesByPeriod.set(p, matchPeriodRows(imports, p));
  }
  return linesByPeriod;
}

export function buildAgentCommissionRowsFromImports(
  imports: SupplierImportBatch[],
  period = currentPeriod(),
): AgentCommissionRow[] {
  syncCurrentPeriodSnapshot(period);
  rebuildAgentRateIndex();
  const linesByPeriod = buildMatchedLinesByPeriod(imports, agentCommissionPeriods(period));
  const lines = linesByPeriod.get(period) ?? [];
  return aggregateAgentRows(lines, period, linesByPeriod);
}

/** Update agent MRC stats from deal master contract MRC (for Agents tab). */
export function agentPortfolioMrc(agentCommId: string): number {
  void agentCommId;
  return 0;
}
