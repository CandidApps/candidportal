'use client';

import {
  mergeManualImportBatches,
  normalizeStoredManualImport,
  type StoredManualImport,
} from '@/lib/commissions/manual-import-batch';
import type { SupplierId, SupplierImportBatch } from '@/lib/commissions/supplier-config';

export type { StoredManualImport } from '@/lib/commissions/manual-import-batch';

const KEY = 'candid-manual-commission-imports';

function readAllLocal(): StoredManualImport[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as StoredManualImport[]) : [];
    return parsed.map(normalizeStoredManualImport);
  } catch {
    return [];
  }
}

function writeAllLocal(entries: StoredManualImport[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(entries));
}

async function persistManualImportToServer(entry: StoredManualImport): Promise<void> {
  const res = await fetch('/api/admin/manual-commission-imports', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Failed to save manual import (${res.status})`);
  }
}

/** Save manual upload locally and persist to Supabase for all environments. */
export async function saveManualImport(entry: StoredManualImport): Promise<void> {
  const normalized = normalizeStoredManualImport(entry);
  const all = readAllLocal().filter(
    (m) => !(m.supplier === normalized.supplier && m.period === normalized.period),
  );
  all.push(normalized);
  writeAllLocal(all);

  await persistManualImportToServer(normalized);
  window.dispatchEvent(new Event('candid-commissions-updated'));
}

/** Push any browser-only manual uploads to Supabase (one-time sync from live app). */
export async function syncLocalManualImportsToServer(): Promise<void> {
  const local = readAllLocal();
  if (!local.length) return;

  await Promise.all(local.map((entry) => persistManualImportToServer(entry)));
}

/** True when a manual import exists locally for this supplier and period. */
export function hasManualImport(supplier: SupplierId, period: string): boolean {
  return readAllLocal().some((m) => m.supplier === supplier && m.period === period);
}

/** Merge any local-only manual imports on top of API batches (local wins on conflict). */
export function mergeManualBatches(fetched: SupplierImportBatch[]): SupplierImportBatch[] {
  return mergeManualImportBatches(fetched, readAllLocal());
}
