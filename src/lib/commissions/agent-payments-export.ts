import {
  buildAgentPaymentDetailRows,
} from '@/lib/commissions/agent-payment-breakdown';
import { formatPeriodLabel, type AgentCommissionRowView } from '@/lib/commissions/commission-store';
import type { SupplierImportBatch } from '@/lib/commissions/supplier-config';
import {
  downloadStructuredWorkbookXlsx,
  sanitizeSheetName,
  type StructuredWorkbookSheet,
  type WorkbookSheetLink,
} from '@/lib/spreadsheet-io';

const DETAIL_SHEET_FORMAT: Pick<
  StructuredWorkbookSheet,
  'currencyCols' | 'percentCols' | 'columnWidths'
> = {
  currencyCols: [1, 3, 4, 6, 8],
  percentCols: [2],
  columnWidths: [34, 14, 10, 14, 12, 30, 12, 34, 14],
};

function uniqueAgentSheetNames(agents: AgentCommissionRowView[]): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();

  for (const agent of agents) {
    let tab = sanitizeSheetName(agent.company);
    let n = 2;
    while (used.has(tab)) {
      const suffix = ` (${n})`;
      tab = sanitizeSheetName(agent.company, 31 - suffix.length) + suffix;
      n += 1;
    }
    used.add(tab);
    out.set(agent.agentId, tab);
  }

  return out;
}

function buildSummarySheet(
  agents: AgentCommissionRowView[],
  sheetNames: Map<string, string>,
): StructuredWorkbookSheet {
  const rows: (string | number | null)[][] = [
    ['Agent', 'Current month owed', 'Last month paid', 'YTD', 'Status'],
  ];
  const links: WorkbookSheetLink[] = [];

  agents.forEach((agent, index) => {
    rows.push([
      agent.company,
      agent.paid ? 0 : agent.currentMonthOwed,
      agent.lastMonthPaid,
      agent.ytdPaid,
      agent.paid ? 'Paid' : 'Unpaid',
    ]);
    const targetSheet = sheetNames.get(agent.agentId);
    if (targetSheet) {
      links.push({
        row: index + 1,
        col: 0,
        targetSheet,
        tooltip: `View ${agent.company}`,
      });
    }
  });

  return {
    name: 'Summary',
    rows,
    links,
    currencyCols: [1, 2, 3],
    columnWidths: [30, 18, 16, 14, 12],
  };
}

function buildAgentDetailSheet(
  agent: AgentCommissionRowView,
  tabName: string,
): StructuredWorkbookSheet {
  const { rows, subheaderRows } = buildAgentPaymentDetailRows(agent.customers);

  return {
    name: tabName,
    rows,
    subheaderRows,
    ...DETAIL_SHEET_FORMAT,
  };
}

/** Export agent payments — summary tab plus one Excel tab per agent. */
export async function exportAgentPaymentsXlsx(
  period: string,
  _imports: SupplierImportBatch[],
  agents: AgentCommissionRowView[],
): Promise<void> {
  const sheetNames = uniqueAgentSheetNames(agents);
  const sheets: StructuredWorkbookSheet[] = [
    buildSummarySheet(agents, sheetNames),
    ...agents.map((agent) =>
      buildAgentDetailSheet(agent, sheetNames.get(agent.agentId) ?? sanitizeSheetName(agent.company)),
    ),
  ];

  const safePeriod = period.replace(/[^\d-]/g, '') || 'report';
  const label = formatPeriodLabel(period).replace(/[^\w\s-]/g, '').trim();
  await downloadStructuredWorkbookXlsx(
    `agent-payments-${safePeriod}${label ? `-${label.replace(/\s+/g, '-')}` : ''}.xlsx`,
    sheets,
  );
}
