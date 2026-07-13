'use client';

import type { SupplierImportBatch } from '@/lib/commissions/supplier-config';
import type {
  FetchCommissionOptions,
  SupplierCommissionFetchResult,
} from '@/lib/services/supplier-commissions-core';

export { normalizeCommissionPeriod } from '@/lib/services/supplier-commissions-core';
export type { FetchCommissionOptions } from '@/lib/services/supplier-commissions-core';

export type SupplierCommissionFetchResponse = SupplierCommissionFetchResult;

function buildQuery(options?: FetchCommissionOptions): string {
  const params = new URLSearchParams();
  if (options?.periods?.length) params.set('periods', options.periods.join(','));
  if (options?.summariesOnly) params.set('summariesOnly', '1');
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function fetchSupplierCommissions(
  options?: FetchCommissionOptions,
): Promise<SupplierCommissionFetchResult> {
  const res = await fetch(`/api/admin/supplier-commissions${buildQuery(options)}`, {
    cache: 'no-store',
  });
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
