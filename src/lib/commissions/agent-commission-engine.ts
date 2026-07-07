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
import type {
  AgentCommissionCustomer,
  AgentCommissionRow,
} from '@/lib/commissions/commission-store';
import {
  currentPeriod,
  periodBefore,
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

function matchPeriodRows(
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

      const ratePct = added?.commissionRate ?? commissionRateForAgent(agentCommId, period);
      const agentPayout = Math.round(supplierAmount * (ratePct / 100) * 100) / 100;

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
  imports: SupplierImportBatch[],
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
  const lastMonthLines = matchPeriodRows(imports, prevPeriod).filter(
    (l) => resolveAgentMergeKey(l.agentCommId) === mergeKey,
  );
  const lastMonthPaid = lastMonthLines.reduce((s, l) => s + l.agentPayout, 0);

  const ytdPeriods = [...new Set(imports.map((i) => i.period))]
    .filter((p) => p <= period && p.startsWith(period.slice(0, 4)))
    .sort();

  let ytdPaid = 0;
  for (const p of ytdPeriods) {
    const periodLines = matchPeriodRows(imports, p).filter(
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
  imports: SupplierImportBatch[],
): AgentCommissionRow[] {
  const byAgent = new Map<string, MatchedLine[]>();
  for (const line of lines) {
    const mergeKey = resolveAgentMergeKey(line.agentCommId);
    const list = byAgent.get(mergeKey) ?? [];
    list.push(line);
    byAgent.set(mergeKey, list);
  }

  return [...byAgent.entries()]
    .map(([mergeKey, agentLines]) => buildAgentRow(mergeKey, agentLines, period, imports))
    .sort((a, b) => a.company.localeCompare(b.company, undefined, { sensitivity: 'base' }));
}

export function buildAgentCommissionRowsFromImports(
  imports: SupplierImportBatch[],
  period = currentPeriod(),
): AgentCommissionRow[] {
  syncCurrentPeriodSnapshot(period);
  rebuildAgentRateIndex();
  const lines = matchPeriodRows(imports, period);
  return aggregateAgentRows(lines, period, imports);
}

/** Update agent MRC stats from deal master contract MRC (for Agents tab). */
export function agentPortfolioMrc(agentCommId: string): number {
  void agentCommId;
  return 0;
}
