import { getAddedDeal } from '@/lib/bmw/added-deals';
import {
  agentCommIdForDeal,
  commissionRateForAgent,
  syncCurrentPeriodSnapshot,
} from '@/lib/bmw/agent-comm-history';
import { commissionRowCustomer, matchDealToCommissionRow } from '@/lib/bmw/commission-match';
import {
  rebuildAgentRateIndex,
  resolveAgentDisplayName,
  resolveAgentEmail,
  resolveAgentMergeKey,
} from '@/lib/bmw/deal-master';
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
import type { SupplierImportBatch } from '@/lib/commissions/supplier-config';
import { commissionRowAmountForBatch } from '@/lib/commissions/supplier-config';

type MatchedLine = {
  agentCommId: string;
  company: string;
  supplier: string;
  supplierAmount: number;
  agentPayout: number;
  commissionRate: number;
  dealUid: string;
};

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
      if (isDealExcludedFromPayout(batch.supplier, period, deal.dealUid)) continue;

      const supplierAmount = commissionRowAmountForBatch(batch, row);
      if (supplierAmount === 0) continue;

      const added = getAddedDeal(batch.supplier, deal.dealUid);
      const agentCommId = agentCommIdForDeal(deal, period) || added?.agentCommId || deal.agentCommId || '';
      if (!agentCommId) continue;

      const primaryPayable = isAgentPayableForPeriod(agentCommId, period);

      if (!primaryPayable) {
        const overrideLines = overridePayoutLinesForDeal(supplierAmount, agentCommId, period);
        for (const overrideLine of overrideLines) {
          lines.push({
            agentCommId: overrideLine.overrideCommId,
            company: deal.merchant || commissionRowCustomer(row) || 'Unknown merchant',
            supplier: paySourceForSupplier(batch.supplier),
            supplierAmount,
            agentPayout: overrideLine.overridePayout,
            commissionRate: overrideLine.overrideRate,
            dealUid: deal.dealUid,
          });
        }
        continue;
      }

      const ratePct = added?.commissionRate ?? commissionRateForAgent(agentCommId, period);
      const agentPayout = computeAgentPayout(supplierAmount, agentCommId, period, ratePct);

      lines.push({
        agentCommId,
        company: deal.merchant || commissionRowCustomer(row) || 'Unknown merchant',
        supplier: paySourceForSupplier(batch.supplier),
        supplierAmount,
        agentPayout,
        commissionRate: ratePct,
        dealUid: deal.dealUid,
      });
    }
  }

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
    }))
    .sort(
      (a, b) =>
        a.company.localeCompare(b.company, undefined, { sensitivity: 'base' }) ||
        a.supplier.localeCompare(b.supplier, undefined, { sensitivity: 'base' }),
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
