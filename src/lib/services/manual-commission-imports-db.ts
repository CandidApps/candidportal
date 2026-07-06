import type { SupabaseClient } from '@supabase/supabase-js';
import {
  manualImportToBatch,
  mergeManualImportBatches,
  normalizeStoredManualImport,
  type StoredManualImport,
} from '@/lib/commissions/manual-import-batch';
import type { SupplierImportBatch } from '@/lib/commissions/supplier-config';
import { SUPPLIER_IDS, type SupplierId } from '@/lib/commissions/supplier-config';

type ManualImportRow = {
  supplier: string;
  period: string;
  amount_field: string;
  filename: string | null;
  imported_at: string;
  rows: Record<string, unknown>[];
};

function rowToStored(row: ManualImportRow): StoredManualImport {
  return normalizeStoredManualImport({
    supplier: row.supplier as SupplierId,
    period: row.period,
    amountField: row.amount_field,
    filename: row.filename ?? '',
    importedAt: row.imported_at,
    rows: row.rows ?? [],
  });
}

function isSupplierId(value: string): value is SupplierId {
  return (SUPPLIER_IDS as string[]).includes(value);
}

export async function loadManualCommissionImports(
  admin: SupabaseClient,
): Promise<StoredManualImport[]> {
  const { data, error } = await admin
    .from('manual_commission_imports')
    .select('supplier, period, amount_field, filename, imported_at, rows')
    .order('imported_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data as ManualImportRow[] | null ?? [])
    .filter((row) => isSupplierId(row.supplier))
    .map(rowToStored);
}

export async function upsertManualCommissionImport(
  admin: SupabaseClient,
  entry: StoredManualImport,
): Promise<void> {
  const normalized = normalizeStoredManualImport(entry);
  if (!isSupplierId(normalized.supplier)) {
    throw new Error(`Unknown supplier: ${normalized.supplier}`);
  }

  const { error } = await admin.from('manual_commission_imports').upsert(
    {
      supplier: normalized.supplier,
      period: normalized.period,
      amount_field: resolveAmountFieldForDb(normalized),
      filename: normalized.filename,
      imported_at: normalized.importedAt || new Date().toISOString(),
      rows: normalized.rows,
    },
    { onConflict: 'supplier,period' },
  );

  if (error) throw new Error(error.message);
}

function resolveAmountFieldForDb(entry: StoredManualImport): string {
  return manualImportToBatch(entry).amountField ?? entry.amountField;
}

export async function mergeDbManualImportsIntoBatches(
  admin: SupabaseClient,
  batches: SupplierImportBatch[],
): Promise<SupplierImportBatch[]> {
  const manualEntries = await loadManualCommissionImports(admin);
  return mergeManualImportBatches(batches, manualEntries);
}
