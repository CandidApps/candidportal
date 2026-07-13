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

export type FetchCommissionOptions = {
  /** Limit to these commission periods (YYYY-MM). */
  periods?: string[];
  /** Omit row arrays from batches (totals and counts only). */
  summariesOnly?: boolean;
};

/** Match rows to commission periods using every configured period column. */
export function filterRowsByCommissionPeriods(
  config: SupplierTableConfig,
  rows: Record<string, unknown>[],
  periods: string[],
): Record<string, unknown>[] {
  if (!periods.length) return rows;
  const allowed = new Set(periods);
  return rows.filter((row) => {
    for (const field of config.periodFields) {
      const normalized = normalizeCommissionPeriod(row[field]);
      if (normalized && allowed.has(normalized)) return true;
    }
    return false;
  });
}

function stripBatchRows(batch: SupplierImportBatch): SupplierImportBatch {
  return { ...batch, rows: [] };
}

export async function fetchAllSupplierCommissionBatches(
  queryTable: (
    config: SupplierTableConfig,
  ) => Promise<{ data: Record<string, unknown>[] | null; error: string | null }>,
  options?: FetchCommissionOptions,
): Promise<SupplierCommissionFetchResult> {
  const errors: SupplierFetchError[] = [];
  const batches: SupplierImportBatch[] = [];
  const periodFilter = options?.periods?.length ? new Set(options.periods) : null;

  await Promise.all(
    SUPPLIER_CONFIGS.map(async (config) => {
      const { data, error } = await queryTable(config);
      if (error) {
        errors.push({ supplier: config.id, table: config.table, message: error });
        return;
      }
      batches.push(...buildBatchesFromRows(config, data ?? []));
    }),
  );

  let filtered = periodFilter
    ? batches.filter((batch) => periodFilter.has(batch.period))
    : batches;

  const expanded = expandRecurringSupplierBatches(filtered);
  filtered = periodFilter
    ? expanded.filter((batch) => periodFilter.has(batch.period))
    : expanded;

  if (options?.summariesOnly) {
    filtered = filtered.map(stripBatchRows);
  }

  return { batches: filtered, errors };
}
