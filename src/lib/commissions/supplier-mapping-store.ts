'use client';

import type { SupplierId, SupplierImportBatch } from '@/lib/commissions/supplier-config';
import {
  resolveBatchColumnMapping,
  type ResolvedSupplierColumnMapping,
} from '@/lib/commissions/supplier-column-mapping';

export type SupplierPeriodColumnMapping = ResolvedSupplierColumnMapping & {
  supplier: SupplierId;
  period: string;
  updatedAt: string;
};

const KEY = 'candid-supplier-commission-mappings';

function readAll(): SupplierPeriodColumnMapping[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as SupplierPeriodColumnMapping[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: SupplierPeriodColumnMapping[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(entries));
}

function entryKey(supplier: SupplierId, period: string): string {
  return `${supplier}:${period}`;
}

export function getSupplierPeriodMapping(
  supplier: SupplierId,
  period: string,
): SupplierPeriodColumnMapping | null {
  return readAll().find((e) => e.supplier === supplier && e.period === period) ?? null;
}

export function listSupplierPeriodMappings(period: string): SupplierPeriodColumnMapping[] {
  return readAll().filter((e) => e.period === period);
}

export function saveSupplierPeriodMapping(
  entry: Omit<SupplierPeriodColumnMapping, 'updatedAt'> & { updatedAt?: string },
): SupplierPeriodColumnMapping {
  const saved: SupplierPeriodColumnMapping = {
    supplier: entry.supplier,
    period: entry.period,
    dealUidField: entry.dealUidField,
    customerField: entry.customerField,
    amountField: entry.amountField,
    updatedAt: entry.updatedAt ?? new Date().toISOString(),
  };
  const all = readAll().filter(
    (e) => !(e.supplier === saved.supplier && e.period === saved.period),
  );
  all.push(saved);
  writeAll(all);
  window.dispatchEvent(new Event('candid-commissions-updated'));
  return saved;
}

export function saveSupplierPeriodMappings(
  period: string,
  mappings: Array<Omit<SupplierPeriodColumnMapping, 'period' | 'updatedAt'> & { updatedAt?: string }>,
): void {
  const others = readAll().filter((e) => e.period !== period);
  const next = mappings.map((m) => ({
    supplier: m.supplier,
    period,
    dealUidField: m.dealUidField,
    customerField: m.customerField,
    amountField: m.amountField,
    updatedAt: m.updatedAt ?? new Date().toISOString(),
  }));
  writeAll([...others, ...next]);
  window.dispatchEvent(new Event('candid-commissions-updated'));
}

/** Attach stored / suggested column mappings onto import batches. */
export function applyStoredMappingsToBatches(
  batches: SupplierImportBatch[],
): SupplierImportBatch[] {
  return batches.map((batch) => {
    const stored = getSupplierPeriodMapping(batch.supplier, batch.period);
    const resolved = resolveBatchColumnMapping(batch.supplier, batch.rows, {
      uidField: stored?.dealUidField || batch.uidField,
      customerField: stored?.customerField || batch.customerField,
      amountField: stored?.amountField || batch.amountField,
    });
    return {
      ...batch,
      uidField: resolved.dealUidField || batch.uidField,
      customerField: resolved.customerField || batch.customerField,
      amountField: resolved.amountField || batch.amountField,
    };
  });
}

export function mappingKey(supplier: SupplierId, period: string): string {
  return entryKey(supplier, period);
}
