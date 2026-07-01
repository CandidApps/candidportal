import { agentCommIdForDeal, commissionRateForAgent } from '@/lib/bmw/agent-comm-history';
import { getAddedDeal } from '@/lib/bmw/added-deals';
import { matchDealToCommissionRow } from '@/lib/bmw/commission-match';
import { resolveAgentDisplayName } from '@/lib/bmw/deal-master';
import {
  displayColumnsForSupplier,
  formatPeriodLabel,
  periodBefore,
  sortCommissionRowsAlphabetically,
  supplierPeriodTotals,
  type SupplierImportBatch,
} from '@/lib/commissions/commission-store';
import { paySourceVerifiedRows } from '@/lib/commissions/verify-commissions';
import type { SupplierId } from '@/lib/commissions/supplier-config';
import { downloadMultiSheetXlsx, type SheetRow } from '@/lib/spreadsheet-io';

export type SupplierReportExportEntry = {
  key: string;
  label: string;
  supplierId: SupplierId | null;
  commissionTotal: number;
  depositTotal: number | null;
  variance: number | null;
};

function exportScalar(v: unknown): string | number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.-]/g, ''));
  if (/^[$]?-?[\d,]+\.?\d*$/.test(s.replace(/\$/g, '')) && Number.isFinite(n)) return n;
  return s;
}

function summaryRows(entry: SupplierReportExportEntry, period: string, prevTotal: number): SheetRow[] {
  return [
    { Field: 'Supplier', Value: entry.label },
    { Field: 'Period', Value: formatPeriodLabel(period) },
    { Field: 'Commission total', Value: entry.commissionTotal },
    { Field: 'Deposit amount', Value: entry.depositTotal ?? null },
    { Field: 'Variance', Value: entry.variance ?? null },
    { Field: 'Previous month total', Value: prevTotal },
    { Field: '', Value: null },
  ];
}

function batchDetailRows(batch: SupplierImportBatch): SheetRow[] {
  const cols = displayColumnsForSupplier(batch.supplier, batch.rows);
  const sortedRows = sortCommissionRowsAlphabetically(batch.supplier, batch.rows);

  return sortedRows.map((row) => {
    const deal = matchDealToCommissionRow(batch.supplier, row);
    const added = deal ? getAddedDeal(batch.supplier, deal.dealUid) : undefined;
    const agentCommId = deal ? agentCommIdForDeal(deal, batch.period) : '';
    const agentName = agentCommId ? resolveAgentDisplayName(agentCommId) : '';
    const commissionRate = added
      ? added.commissionRate
      : agentCommId
        ? commissionRateForAgent(agentCommId, batch.period)
        : null;

    const out: SheetRow = {};
    for (const c of cols) {
      out[c.replace(/_/g, ' ')] = exportScalar(row[c]);
    }
    out.Agent = agentName || null;
    out['Rate %'] = commissionRate;
    return out;
  });
}

function verifiedDetailRows(sourceKey: string, period: string): SheetRow[] {
  return paySourceVerifiedRows(sourceKey, period).map((line) => ({
    'Deal UID': line.dealUid,
    Merchant: line.merchant,
    Amount: line.amount,
  }));
}

function buildSheetRows(
  entry: SupplierReportExportEntry,
  period: string,
  imports: SupplierImportBatch[],
): SheetRow[] {
  const prev = periodBefore(period);
  const prevTotal = entry.supplierId
    ? supplierPeriodTotals(imports, entry.supplierId, prev)
    : 0;

  const rows = [...summaryRows(entry, period, prevTotal)];

  if (entry.supplierId) {
    const batch = imports.find((i) => i.supplier === entry.supplierId && i.period === period);
    if (batch?.rows.length) {
      rows.push(...batchDetailRows(batch));
    }
    return rows;
  }

  const verified = verifiedDetailRows(entry.key, period);
  if (verified.length) rows.push(...verified);
  return rows;
}

/** Export supplier commission detail — one Excel tab per supplier / pay source. */
export async function exportSupplierReportsXlsx(
  period: string,
  imports: SupplierImportBatch[],
  entries: SupplierReportExportEntry[],
): Promise<void> {
  const sheets = entries.map((entry) => ({
    name: entry.label,
    rows: buildSheetRows(entry, period, imports),
  }));

  const safePeriod = period.replace(/[^\d-]/g, '') || 'report';
  await downloadMultiSheetXlsx(`supplier-reports-${safePeriod}.xlsx`, sheets);
}
