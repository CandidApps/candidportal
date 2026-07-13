import {
  formatPeriodLabel,
  periodBefore,
  supplierPeriodTotals,
  type SupplierImportBatch,
} from '@/lib/commissions/commission-store';
import {
  supplierDetailRowsForBatch,
  verifiedPaySourceDetailRows,
} from '@/lib/commissions/commission-export-rows';
import { paySourceVerifiedRows } from '@/lib/commissions/verify-commissions';
import {
  adjustmentsForSupplier,
  reconciliationDetailRow,
  type SupplierPeriodAdjustment,
} from '@/lib/commissions/supplier-reconciliation';
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

function buildSummarySheet(
  period: string,
  imports: SupplierImportBatch[],
  entries: SupplierReportExportEntry[],
): SheetRow[] {
  const prev = periodBefore(period);
  return entries.map((entry) => ({
    Supplier: entry.label,
    Period: formatPeriodLabel(period),
    Total: entry.commissionTotal,
    'Deposit amount': entry.depositTotal,
    Variance: entry.variance,
    'Previous month': entry.supplierId
      ? supplierPeriodTotals(imports, entry.supplierId, prev)
      : null,
  }));
}

function buildSupplierSheetRows(
  entry: SupplierReportExportEntry,
  period: string,
  imports: SupplierImportBatch[],
  adjustments: SupplierPeriodAdjustment[],
): SheetRow[] {
  if (entry.supplierId) {
    const batch = imports.find((i) => i.supplier === entry.supplierId && i.period === period);
    const rows = batch?.rows.length ? supplierDetailRowsForBatch(batch) : [];
    const adj = adjustmentsForSupplier(adjustments, entry.supplierId, period)[0];
    if (adj) rows.push(reconciliationDetailRow(adj) as SheetRow);
    return rows;
  }

  const verified = paySourceVerifiedRows(entry.key, period);
  if (verified.length) return verifiedPaySourceDetailRows(entry.label, verified);
  return [];
}

/** Export supplier commission detail — summary tab plus one Excel tab per supplier / pay source. */
export async function exportSupplierReportsXlsx(
  period: string,
  imports: SupplierImportBatch[],
  entries: SupplierReportExportEntry[],
  adjustments: SupplierPeriodAdjustment[] = [],
): Promise<void> {
  const sheets = [
    { name: 'Summary', rows: buildSummarySheet(period, imports, entries) },
    ...entries.map((entry) => ({
      name: entry.label,
      rows: buildSupplierSheetRows(entry, period, imports, adjustments),
    })),
  ];

  const safePeriod = period.replace(/[^\d-]/g, '') || 'report';
  await downloadMultiSheetXlsx(`supplier-reports-${safePeriod}.xlsx`, sheets);
}
