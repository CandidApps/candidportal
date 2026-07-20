'use client';

import {
  mergeManualImportBatches,
  normalizeStoredManualImport,
  type StoredManualImport,
} from '@/lib/commissions/manual-import-batch';
import type { SupplierId, SupplierImportBatch } from '@/lib/commissions/supplier-config';
import { applyStoredMappingsToBatches } from '@/lib/commissions/supplier-mapping-store';

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

function entryKey(entry: Pick<StoredManualImport, 'supplier' | 'period'>): string {
  return `${entry.supplier}:${entry.period}`;
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

async function fetchServerManualImports(): Promise<StoredManualImport[]> {
  const res = await fetch('/api/admin/manual-commission-imports');
  if (!res.ok) return [];
  const body = (await res.json().catch(() => null)) as { imports?: StoredManualImport[] } | null;
  return (body?.imports ?? []).map(normalizeStoredManualImport);
}

/**
 * Merge local + server manuals. Server wins on supplier+period conflicts so repaired
 * rows (and multi-device edits) are not clobbered by stale browser localStorage.
 * Local-only entries are kept and pushed up.
 */
function mergeLocalAndServerImports(
  local: StoredManualImport[],
  server: StoredManualImport[],
): StoredManualImport[] {
  const byKey = new Map<string, StoredManualImport>();
  for (const entry of local) byKey.set(entryKey(entry), entry);
  for (const entry of server) byKey.set(entryKey(entry), entry);
  return Array.from(byKey.values());
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

/** Align browser cache with Supabase, then push any local-only uploads. */
export async function syncLocalManualImportsToServer(): Promise<void> {
  const local = readAllLocal();
  const server = await fetchServerManualImports();
  const merged = mergeLocalAndServerImports(local, server);
  writeAllLocal(merged);

  const serverKeys = new Set(server.map(entryKey));
  const localOnly = merged.filter((entry) => !serverKeys.has(entryKey(entry)));
  if (!localOnly.length) return;

  await Promise.all(localOnly.map((entry) => persistManualImportToServer(entry)));
}

/** True when a manual import exists locally for this supplier and period. */
export function hasManualImport(supplier: SupplierId, period: string): boolean {
  return readAllLocal().some((m) => m.supplier === supplier && m.period === period);
}

export function getManualImport(
  supplier: SupplierId,
  period: string,
): StoredManualImport | null {
  return readAllLocal().find((m) => m.supplier === supplier && m.period === period) ?? null;
}

/** Merge any local-only manual imports on top of API batches (local wins on conflict). */
export function mergeManualBatches(fetched: SupplierImportBatch[]): SupplierImportBatch[] {
  return applyStoredMappingsToBatches(mergeManualImportBatches(fetched, readAllLocal()));
}
