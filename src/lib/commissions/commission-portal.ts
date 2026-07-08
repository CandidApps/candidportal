import { paySourceForSupplier } from '@/lib/bmw/pay-source-map';
import { commissionSourceKey } from '@/lib/commission-partners';
import type { PartnerSupplierRecord } from '@/lib/bank-deposits/source-match';
import type { SupplierId } from '@/lib/commissions/supplier-config';

function normalizePortalUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function findCommissionPartnerRecord(
  partners: PartnerSupplierRecord[],
  paySourceLabel: string,
): PartnerSupplierRecord | null {
  const key = commissionSourceKey(paySourceLabel);
  return (
    partners.find((p) => commissionSourceKey(p.display_name ?? p.name) === key) ??
    partners.find((p) => p.bank_source_aliases.some((a) => commissionSourceKey(a) === key)) ??
    partners.find((p) => commissionSourceKey(p.name) === key) ??
    null
  );
}

export function commissionPortalUrl(
  partners: PartnerSupplierRecord[],
  opts: { supplierId?: SupplierId | null; paySourceLabel?: string },
): string | null {
  const paySource = opts.supplierId
    ? paySourceForSupplier(opts.supplierId)
    : (opts.paySourceLabel ?? '').trim();
  if (!paySource) return null;
  const partner = findCommissionPartnerRecord(partners, paySource);
  const raw = partner?.website?.trim();
  return raw ? normalizePortalUrl(raw) : null;
}
