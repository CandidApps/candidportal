'use client';

import type { PartnerSupplierRecord } from '@/lib/bank-deposits/source-match';
import { mergeDepositTotalsByPaySource } from '@/lib/commission-partners';

export type { PartnerSupplierRecord };

export type BankDepositImportSummary = {
  id: number;
  filename: string;
  period_start: string | null;
  period_end: string | null;
  row_count: number;
  imported_at: string;
};

export type BankDepositLineRecord = {
  id: number;
  import_id: number;
  line_index: number;
  details: string | null;
  posting_date: string;
  description: string;
  amount: number;
  deposit_type: string;
  partner_supplier_id: number | null;
  supplier_key: string | null;
  source_match_label: string | null;
  orig_co_name: string | null;
  orig_id: string | null;
  commission_period: string | null;
  supplier_commission_amount: number | null;
  match_status: string;
  variance: number | null;
};

export type SaveBankDepositPayload = {
  filename: string;
  periodStart: string | null;
  periodEnd: string | null;
  lines: Array<{
    lineIndex: number;
    details: string | null;
    postingDate: string;
    description: string;
    amount: number;
    depositType: string;
    partnerId: number | null;
    supplierKey: string | null;
    sourceMatchLabel: string;
    origCoName: string | null;
    origId: string | null;
    commissionPeriod: string | null;
    supplierCommissionAmount: number | null;
    matchStatus: string;
    variance: number | null;
  }>;
};

export async function fetchPartnerSuppliers(): Promise<PartnerSupplierRecord[]> {
  const res = await fetch('/api/admin/partner-suppliers', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load suppliers');
  return (await res.json()) as PartnerSupplierRecord[];
}

export async function createPartnerSupplier(payload: {
  name: string;
  displayName?: string;
  supplierKey?: string | null;
  bankOrigCoName?: string | null;
  bankOrigId?: string | null;
  bankSourceAliases?: string[];
  commissionRate?: number | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  website?: string | null;
  notes?: string | null;
  providerCategory?: string | null;
  depositType?: string;
}): Promise<PartnerSupplierRecord> {
  const res = await fetch('/api/admin/partner-suppliers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Failed to create supplier');
  }
  return (await res.json()) as PartnerSupplierRecord;
}

export async function updatePartnerSupplier(payload: {
  id: number;
  displayName?: string;
  bankOrigCoName?: string | null;
  bankOrigId?: string | null;
  bankSourceAliases?: string[];
  commissionRate?: number | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  website?: string | null;
  notes?: string | null;
  providerCategory?: string | null;
}): Promise<PartnerSupplierRecord> {
  const res = await fetch('/api/admin/partner-suppliers', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Failed to update partner');
  }
  return (await res.json()) as PartnerSupplierRecord;
}

export async function fetchBankDepositImports(): Promise<BankDepositImportSummary[]> {
  const res = await fetch('/api/admin/bank-deposits', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load bank deposits');
  return (await res.json()) as BankDepositImportSummary[];
}

export async function fetchBankDepositLines(importId: number): Promise<BankDepositLineRecord[]> {
  const res = await fetch(`/api/admin/bank-deposits?importId=${importId}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load deposit lines');
  return (await res.json()) as BankDepositLineRecord[];
}

export type BankDepositPeriodTotal = { total: number; label: string };

/** Deposit totals for a commission period, keyed by supplier_key or source label. */
export async function fetchBankDepositTotalsBySupplier(
  period: string,
): Promise<Record<string, BankDepositPeriodTotal>> {
  const res = await fetch(`/api/admin/bank-deposits?period=${encodeURIComponent(period)}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to load bank deposit totals');
  const totals = (await res.json()) as Record<string, BankDepositPeriodTotal>;
  return mergeDepositTotalsByPaySource(totals);
}

export async function saveBankDepositImport(payload: SaveBankDepositPayload): Promise<{ id: number }> {
  const res = await fetch('/api/admin/bank-deposits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Failed to save bank deposit import');
  }
  return (await res.json()) as { id: number };
}

export async function updateBankDepositImport(
  importId: number,
  payload: SaveBankDepositPayload,
): Promise<{ id: number }> {
  const res = await fetch('/api/admin/bank-deposits', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: importId, ...payload }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Failed to update bank deposit import');
  }
  return (await res.json()) as { id: number };
}

export async function deleteBankDepositImport(importId: number): Promise<void> {
  const res = await fetch(`/api/admin/bank-deposits?id=${importId}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Failed to delete bank deposit import');
  }
}
