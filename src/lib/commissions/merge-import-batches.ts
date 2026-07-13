import type { SupplierImportBatch } from '@/lib/commissions/supplier-config';

function pickRicherBatch(
  existing: SupplierImportBatch | undefined,
  incoming: SupplierImportBatch,
): SupplierImportBatch {
  if (!existing) return incoming;
  if (incoming.rows.length > 0) return incoming;
  if (existing.rows.length > 0) {
    return {
      ...incoming,
      rows: existing.rows,
      rowCount: Math.max(incoming.rowCount, existing.rowCount),
      totalAmount: incoming.totalAmount || existing.totalAmount,
    };
  }
  return {
    ...incoming,
    rowCount: Math.max(incoming.rowCount, existing.rowCount),
    totalAmount: incoming.totalAmount || existing.totalAmount,
  };
}

/** Merge summary batches (no rows) with detail batches; detail wins for the same supplier+period. */
export function mergeCommissionImportBatches(
  summaries: SupplierImportBatch[],
  detail: SupplierImportBatch[],
): SupplierImportBatch[] {
  const byKey = new Map<string, SupplierImportBatch>();
  for (const batch of summaries) {
    byKey.set(`${batch.supplier}::${batch.period}`, batch);
  }
  for (const batch of detail) {
    const key = `${batch.supplier}::${batch.period}`;
    byKey.set(key, pickRicherBatch(byKey.get(key), batch));
  }
  return [...byKey.values()];
}
