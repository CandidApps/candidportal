import {
  amountFieldForSupplier,
  type SupplierId,
  type SupplierImportBatch,
} from '@/lib/commissions/supplier-config';
import { cellNumber, normalizeHeader, type SheetRow } from '@/lib/spreadsheet-io';

export type StoredManualImport = {
  supplier: SupplierId;
  period: string;
  amountField: string;
  filename: string;
  importedAt: string;
  rows: Record<string, unknown>[];
};

export function normalizeStoredPeriod(period: string): string {
  const m = period.trim().match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return period.trim();
  return `${m[1]}-${m[2]!.padStart(2, '0')}`;
}

export function normalizeStoredManualImport(entry: StoredManualImport): StoredManualImport {
  return {
    ...entry,
    period: normalizeStoredPeriod(entry.period),
  };
}

export function resolveAmountField(entry: StoredManualImport): string {
  if (entry.amountField?.trim()) return entry.amountField;
  const configured = amountFieldForSupplier(entry.supplier);
  if (!entry.rows.length) return configured;
  const keys = Object.keys(entry.rows[0]!);
  return keys.find((k) => normalizeHeader(k) === normalizeHeader(configured)) ?? configured;
}

export function manualImportToBatch(entry: StoredManualImport): SupplierImportBatch {
  const normalized = normalizeStoredManualImport(entry);
  const amountField = resolveAmountField(normalized);
  const total = normalized.rows.reduce((s, row) => {
    const fromCell = cellNumber(row as SheetRow, amountField);
    if (fromCell != null && fromCell !== 0) return s + fromCell;
    const v = row[amountField];
    const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);

  return {
    id: `manual-${normalized.supplier}-${normalized.period}`,
    supplier: normalized.supplier,
    period: normalized.period,
    amountField,
    totalAmount: Math.round(total * 100) / 100,
    rowCount: normalized.rows.length,
    importedAt: normalized.importedAt,
    rows: normalized.rows,
  };
}

/** Manual uploads win per supplier+period (supports reupload). */
export function mergeManualImportBatches(
  fetched: SupplierImportBatch[],
  manualEntries: StoredManualImport[],
): SupplierImportBatch[] {
  const manual = manualEntries.map(manualImportToBatch);
  const overridden = new Set(manual.map((m) => `${m.supplier}:${m.period}`));
  const fromDb = fetched.filter((f) => !overridden.has(`${f.supplier}:${f.period}`));
  return [...fromDb, ...manual];
}
