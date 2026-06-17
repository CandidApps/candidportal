import { expandRecurringSupplierBatches } from '@/lib/commissions/recurring-supplier-projections';
import {
  SUPPLIER_CONFIGS,
  type SupplierImportBatch,
  type SupplierTableConfig,
} from '@/lib/commissions/supplier-config';

export function normalizeCommissionPeriod(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  const iso = s.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const slash = s.match(/^(\d{4})\/(\d{2})\//);
  if (slash) return `${slash[1]}-${slash[2]}`;
  const compact = s.match(/^(\d{4})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}`;
  return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : null;
}

function getRowAmount(row: Record<string, unknown>, field: string): number {
  const v = row[field];
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function getRowPeriod(row: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    const normalized = normalizeCommissionPeriod(row[field]);
    if (normalized) return normalized;
  }
  return null;
}

export function buildBatchesFromRows(
  config: SupplierTableConfig,
  rows: Record<string, unknown>[],
): SupplierImportBatch[] {
  const grouped = new Map<
    string,
    { rows: Record<string, unknown>[]; total: number; importedAt: string }
  >();

  for (const row of rows) {
    const period = getRowPeriod(row, config.periodFields);
    if (!period) continue;

    const amount = getRowAmount(row, config.amountField);
    const importedRaw = config.importedAtField ? row[config.importedAtField] : null;
    const importedAt = importedRaw != null && importedRaw !== '' ? String(importedRaw) : '';

    const group = grouped.get(period) ?? { rows: [], total: 0, importedAt: '' };
    group.rows.push(row);
    group.total += amount;
    if (importedAt && (!group.importedAt || importedAt.localeCompare(group.importedAt) > 0)) {
      group.importedAt = importedAt;
    }
    grouped.set(period, group);
  }

  return Array.from(grouped.entries()).map(([period, group]) => ({
    id: `${config.id}-${period}`,
    supplier: config.id,
    period,
    totalAmount: Math.round(group.total * 100) / 100,
    rowCount: group.rows.length,
    importedAt: group.importedAt || `${period}-01T00:00:00.000Z`,
    rows: group.rows,
  }));
}

export type SupplierFetchError = {
  supplier: string;
  table: string;
  message: string;
};

export type SupplierCommissionFetchResult = {
  batches: SupplierImportBatch[];
  errors: SupplierFetchError[];
};

export async function fetchAllSupplierCommissionBatches(
  queryTable: (table: string) => Promise<{ data: Record<string, unknown>[] | null; error: string | null }>,
): Promise<SupplierCommissionFetchResult> {
  const errors: SupplierFetchError[] = [];
  const batches: SupplierImportBatch[] = [];

  await Promise.all(
    SUPPLIER_CONFIGS.map(async (config) => {
      const { data, error } = await queryTable(config.table);
      if (error) {
        errors.push({ supplier: config.id, table: config.table, message: error });
        return;
      }
      batches.push(...buildBatchesFromRows(config, data ?? []));
    }),
  );

  const expanded = expandRecurringSupplierBatches(batches);

  return { batches: expanded, errors };
}
