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

/** Merge locally stored manual imports with DB batches; DB data wins per supplier+period. */
export function mergeManualBatches(fetched: SupplierImportBatch[]): SupplierImportBatch[] {
  const manual = readAll()
    .filter(
      (m) => !fetched.some(
        (f) => f.supplier === m.supplier && f.period === m.period && f.rowCount > 0,
      ),
    )
    .map(toBatch);
  return [...fetched, ...manual];
}
