'use client';

import type { SupplierId, SupplierImportBatch } from '@/lib/commissions/supplier-config';

export type StoredManualImport = {
  supplier: SupplierId;
  period: string;
  amountField: string;
  filename: string;
  importedAt: string;
  rows: Record<string, unknown>[];
};

const KEY = 'candid-manual-commission-imports';

function readAll(): StoredManualImport[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredManualImport[]) : [];
  } catch {
    return [];
  }
}

export function saveManualImport(entry: StoredManualImport): void {
  const all = readAll().filter(
    (m) => !(m.supplier === entry.supplier && m.period === entry.period),
  );
  all.push(entry);
  localStorage.setItem(KEY, JSON.stringify(all));
  window.dispatchEvent(new Event('candid-commissions-updated'));
}

function toBatch(entry: StoredManualImport): SupplierImportBatch {
  const total = entry.rows.reduce((s, row) => {
    const v = row[entry.amountField];
    const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);

  return {
    id: `manual-${entry.supplier}-${entry.period}`,
    supplier: entry.supplier,
    period: entry.period,
    totalAmount: Math.round(total * 100) / 100,
    rowCount: entry.rows.length,
    importedAt: entry.importedAt,
    rows: entry.rows,
  };
}

/** True when a manual import exists for this supplier and period (overrides auto-imported data). */
export function hasManualImport(supplier: SupplierId, period: string): boolean {
  return readAll().some((m) => m.supplier === supplier && m.period === period);
}

/** Merge manual imports with DB batches; manual uploads win per supplier+period (supports reupload). */
export function mergeManualBatches(fetched: SupplierImportBatch[]): SupplierImportBatch[] {
  const manual = readAll().map(toBatch);
  const overridden = new Set(manual.map((m) => `${m.supplier}:${m.period}`));
  const fromDb = fetched.filter((f) => !overridden.has(`${f.supplier}:${f.period}`));
  return [...fromDb, ...manual];
}
