import {
  SUPPLIER_CONFIGS,
  type SupplierId,
  type SupplierImportBatch,
  type SupplierTableConfig,
} from '@/lib/commissions/supplier-config';
import { buildBatchesFromRows } from '@/lib/services/supplier-commissions-core';

/** Flat monthly recurring suppliers — carry latest row forward through the current period. */
export const RECURRING_SUPPLIER_IDS: SupplierId[] = ['mango', 'weave'];

const ROW_KEY_FIELD: Partial<Record<SupplierId, string>> = {
  mango: 'account_num',
  weave: 'partner_object_name',
};

export function currentCommissionPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function periodAfter(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function periodsThrough(fromPeriod: string, toPeriod: string): string[] {
  const out: string[] = [];
  let p = periodAfter(fromPeriod);
  while (p.localeCompare(toPeriod) <= 0) {
    out.push(p);
    p = periodAfter(p);
  }
  return out;
}

function getRowAmount(row: Record<string, unknown>, field: string): number {
  const v = row[field];
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function recomputeBatchTotals(batch: SupplierImportBatch, amountField: string) {
  batch.rowCount = batch.rows.length;
  batch.totalAmount =
    Math.round(batch.rows.reduce((sum, row) => sum + getRowAmount(row, amountField), 0) * 100) / 100;
}

function configFor(supplier: SupplierId): SupplierTableConfig | undefined {
  return SUPPLIER_CONFIGS.find((c) => c.id === supplier);
}

/**
 * For Mango and Weave, each account pays the same amount every month.
 * Project the latest known row for each account through `upToPeriod` (default: current month).
 */
export function expandRecurringSupplierBatches(
  batches: SupplierImportBatch[],
  upToPeriod = currentCommissionPeriod(),
): SupplierImportBatch[] {
  const byKey = new Map<string, SupplierImportBatch>();
  for (const batch of batches) {
    byKey.set(`${batch.supplier}::${batch.period}`, batch);
  }

  const projectedByKey = new Map<string, Record<string, unknown>[]>();

  for (const supplier of RECURRING_SUPPLIER_IDS) {
    const config = configFor(supplier);
    const keyField = ROW_KEY_FIELD[supplier];
    if (!config || !keyField) continue;

    const latestByAccount = new Map<string, { period: string; row: Record<string, unknown> }>();

    for (const batch of batches) {
      if (batch.supplier !== supplier) continue;
      for (const row of batch.rows) {
        const accountKey = String(row[keyField] ?? '').trim();
        if (!accountKey) continue;
        const prev = latestByAccount.get(accountKey);
        if (!prev || batch.period.localeCompare(prev.period) > 0) {
          latestByAccount.set(accountKey, { period: batch.period, row });
        }
      }
    }

    for (const { period: lastPeriod, row } of latestByAccount.values()) {
      for (const targetPeriod of periodsThrough(lastPeriod, upToPeriod)) {
        const batchKey = `${supplier}::${targetPeriod}`;
        const accountKey = String(row[keyField] ?? '').trim();
        const existingBatch = byKey.get(batchKey);
        if (
          existingBatch?.rows.some(
            (existingRow) => String(existingRow[keyField] ?? '').trim() === accountKey,
          )
        ) {
          continue;
        }

        const projectedRow: Record<string, unknown> = {
          ...row,
          period: targetPeriod,
          _projected: true,
        };

        const pending = projectedByKey.get(batchKey) ?? [];
        pending.push(projectedRow);
        projectedByKey.set(batchKey, pending);
      }
    }
  }

  if (!projectedByKey.size) return batches;

  const result = [...batches];

  for (const [batchKey, rows] of projectedByKey) {
    const [supplier, period] = batchKey.split('::') as [SupplierId, string];
    const config = configFor(supplier);
    if (!config) continue;

    const existingBatch = byKey.get(batchKey);
    if (existingBatch) {
      existingBatch.rows.push(...rows);
      recomputeBatchTotals(existingBatch, config.amountField);
      continue;
    }

    const [projectedBatch] = buildBatchesFromRows(config, rows);
    if (!projectedBatch) continue;
    projectedBatch.period = period;
    projectedBatch.id = `${supplier}-${period}`;
    result.push(projectedBatch);
    byKey.set(batchKey, projectedBatch);
  }

  result.sort(
    (a, b) => b.period.localeCompare(a.period) || b.importedAt.localeCompare(a.importedAt),
  );

  return result;
}

export function isProjectedCommissionRow(row: Record<string, unknown>): boolean {
  return row._projected === true;
}

export function batchHasProjectedRows(batch: SupplierImportBatch): boolean {
  return batch.rows.some(isProjectedCommissionRow);
}

export function batchIsFullyProjected(batch: SupplierImportBatch): boolean {
  return batch.rows.length > 0 && batch.rows.every(isProjectedCommissionRow);
}
