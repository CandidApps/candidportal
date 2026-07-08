import type { SupplierImportBatch } from '@/lib/commissions/supplier-config';

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
    byKey.set(`${batch.supplier}::${batch.period}`, batch);
  }
  return [...byKey.values()];
}
