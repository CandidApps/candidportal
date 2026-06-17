'use client';

import type { SupplierImportBatch } from '@/lib/commissions/supplier-config';
import type { SupplierCommissionFetchResult } from '@/lib/services/supplier-commissions-core';

export { normalizeCommissionPeriod } from '@/lib/services/supplier-commissions-core';

export type SupplierCommissionFetchResponse = SupplierCommissionFetchResult;

export async function fetchSupplierCommissions(): Promise<SupplierCommissionFetchResult> {
  const res = await fetch('/api/admin/supplier-commissions', { cache: 'no-store' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Failed to load commissions (${res.status})`);
  }

  return (await res.json()) as SupplierCommissionFetchResult;
}

export async function fetchSupplierCommissionBatches(): Promise<SupplierImportBatch[]> {
  const { batches } = await fetchSupplierCommissions();
  return batches;
}
