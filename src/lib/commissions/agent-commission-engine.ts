import { getAddedDeal } from '@/lib/bmw/added-deals';
import {
  agentCommIdForDeal,
  commissionRateForAgent,
  syncCurrentPeriodSnapshot,
} from '@/lib/bmw/agent-comm-history';
import { matchDealToCommissionRow } from '@/lib/bmw/commission-match';
import {
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
  supplierPeriodTotals,
} from '@/lib/commissions/commission-store';
import { isDealExcludedFromPayout } from '@/lib/commissions/escalate-commissions';
import type { SupplierId, SupplierImportBatch } from '@/lib/commissions/supplier-config';
import { SUPPLIER_CONFIGS } from '@/lib/commissions/supplier-config';

function getRowAmount(row: Record<string, unknown>, field: string): number {
  const v = row[field];
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function amountFieldFor(supplier: SupplierId): string {
  return SUPPLIER_CONFIGS.find((c) => c.id === supplier)?.amountField ?? 'amount';
}

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
    const amountField = amountFieldFor(batch.supplier);

    for (const row of batch.rows) {
      const deal = matchDealToCommissionRow(batch.supplier, row);
      if (!deal) continue;
      if (isDealExcludedFromPayout(batch.supplier, period, deal.dealUid)) continue;

      const supplierAmount = getRowAmount(row, amountField);
      if (supplierAmount === 0) continue;

      const agentCommId = agentCommIdForDeal(deal, period);
      if (!agentCommId) continue;

      const added = getAddedDeal(batch.supplier, deal.dealUid);
      const ratePct = added?.commissionRate ?? commissionRateForAgent(agentCommId, period);
      const agentPayout = Math.round(supplierAmount * (ratePct / 100) * 100) / 100;

      lines.push({
        agentCommId,
        company: deal.merchant,
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

  const prevPeriod = periodBefore(period);
  const ytdPeriods = [...new Set(imports.map((i) => i.period))]
    .filter((p) => p <= period && p.startsWith(period.slice(0, 4)))
    .sort();

  return Array.from(byAgent.entries())
    .map(([mergeKey, agentLines]) => {
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

      const lastMonthLines = matchPeriodRows(imports, prevPeriod).filter(
        (l) => resolveAgentMergeKey(l.agentCommId) === mergeKey,
      );
      const lastMonthPaid = lastMonthLines.reduce((s, l) => s + l.agentPayout, 0);

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
      } satisfies AgentCommissionRow;
    })
    .filter((row) => row.currentMonthOwed !== 0 || row.customers.length > 0)
    .sort((a, b) => a.company.localeCompare(b.company, undefined, { sensitivity: 'base' }));
}

export function buildAgentCommissionRowsFromImports(
  imports: SupplierImportBatch[],
  period = currentPeriod(),
): AgentCommissionRow[] {
  syncCurrentPeriodSnapshot(period);
  const lines = matchPeriodRows(imports, period);
  if (!lines.length) return [];
  return aggregateAgentRows(lines, period, imports);
}

/** Update agent MRC stats from deal master contract MRC (for Agents tab). */
export function agentPortfolioMrc(agentCommId: string): number {
  // placeholder — deals have sparse MRC; return 0 for now
  void agentCommId;
  return 0;
}

export { supplierPeriodTotals };
