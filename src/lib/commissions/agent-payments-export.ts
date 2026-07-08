import { resolveAgentMergeKey } from '@/lib/bmw/deal-master';
import { supplierForPaySource } from '@/lib/bmw/pay-source-map';
import { matchPeriodRows } from '@/lib/commissions/agent-commission-engine';
import {
  agentLineExportRow,
  commissionRowProduct,
  findCommissionRowForDeal,
} from '@/lib/commissions/commission-export-rows';
import { formatPeriodLabel, type AgentCommissionRowView } from '@/lib/commissions/commission-store';
import type { SupplierImportBatch } from '@/lib/commissions/supplier-config';
import { downloadMultiSheetXlsx, type SheetRow } from '@/lib/spreadsheet-io';

function buildSummarySheet(agents: AgentCommissionRowView[]): SheetRow[] {
  return agents.map((agent) => ({
    Agent: agent.company,
    'Current month owed': agent.paid ? 0 : agent.currentMonthOwed,
    'Last month paid': agent.lastMonthPaid,
    YTD: agent.ytdPaid,
    Status: agent.paid ? 'Paid' : 'Unpaid',
  }));
}

function buildAgentDetailSheet(
  agent: AgentCommissionRowView,
  period: string,
  imports: SupplierImportBatch[],
): SheetRow[] {
  const agentLines = matchPeriodRows(imports, period).filter(
    (line) => resolveAgentMergeKey(line.agentCommId) === agent.agentId,
  );

  const rows = agentLines.map((line) => {
    const supplierId = supplierForPaySource(line.supplier);
    const row = supplierId
      ? findCommissionRowForDeal(imports, period, supplierId, line.dealUid)
      : null;
    return agentLineExportRow({
      dealUid: line.dealUid,
      company: line.company,
      vendor: line.supplier,
      productService: row ? commissionRowProduct(row) : '',
      commissionRate: line.commissionRate,
      residual: line.agentPayout,
    });
  });

  for (const customer of agent.customers) {
    if (!customer.id.startsWith('recon-')) continue;
    rows.push(
      agentLineExportRow({
        dealUid: '',
        company: customer.company,
        vendor: customer.supplier,
        productService: 'Reconciliation adjustment',
        commissionRate: 0,
        residual: customer.amount,
      }),
    );
  }

  return rows;
}

/** Export agent payments — summary tab plus one Excel tab per agent. */
export async function exportAgentPaymentsXlsx(
  period: string,
  imports: SupplierImportBatch[],
  agents: AgentCommissionRowView[],
): Promise<void> {
  const sheets = [
    { name: 'Summary', rows: buildSummarySheet(agents) },
    ...agents.map((agent) => ({
      name: agent.company,
      rows: buildAgentDetailSheet(agent, period, imports),
    })),
  ];

  const safePeriod = period.replace(/[^\d-]/g, '') || 'report';
  await downloadMultiSheetXlsx(`agent-payments-${safePeriod}.xlsx`, sheets);
}
