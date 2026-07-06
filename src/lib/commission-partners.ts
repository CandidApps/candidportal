import { getBmwDeals } from '@/lib/bmw/deal-master';
import { PAY_SOURCE_OPTIONS } from '@/lib/customer-records';
import type { PartnerSupplierRecord } from '@/lib/bank-deposits/source-match';

/** Normalize pay source labels for deduplication. */
export function normalizePaySource(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/** Canonical key for matching pay sources across BMW, bank, and UI. */
export function paySourceKey(value: string): string {
  return normalizePaySource(value).toLowerCase();
}

const PAY_SOURCE_ALIASES: Record<string, string> = {
  cardconnect_commissions: 'Fiserv CardConnect',
  payjunction: 'PayJunction',
  'sandler partners': 'Sandler',
  'vendara paysafe': 'Vendara',
  candid: 'Candid',
  'candid solutions': 'Candid',
  teksystems: 'TekSystems',
  tekpartners: 'TekSystems',
  'tek partners': 'TekSystems',
  corpit: 'CorpIT',
  'corporate it dept': 'CorpIT',
  'corporate it dept.': 'CorpIT',
  'corporate it department': 'CorpIT',
  'global payments': 'Global Payments',
};

/** Canonical display name for a commission pay source (BMW, bank, UI). */
export function canonicalPaySource(value: string): string {
  const norm = normalizePaySource(value);
  const alias = PAY_SOURCE_ALIASES[paySourceKey(norm)];
  return alias ?? norm;
}

/** Stable key for grouping aliases (TekPartners = TekSystems, Corporate IT Dept. = CorpIT). */
export function commissionSourceKey(value: string): string {
  return paySourceKey(canonicalPaySource(value));
}

/** Merge deposit totals that share the same canonical pay source (e.g. Candid + Candid Solutions). */
export function mergeDepositTotalsByPaySource<T extends { total: number; label: string }>(
  totals: Record<string, T>,
): Record<string, T> {
  const merged: Record<string, T> = {};
  for (const [rawKey, entry] of Object.entries(totals)) {
    const key = commissionSourceKey(rawKey);
    const label = canonicalPaySource(entry.label || rawKey);
    const existing = merged[key];
    if (existing) {
      existing.total = Math.round((existing.total + entry.total) * 100) / 100;
    } else {
      merged[key] = { ...entry, label };
    }
  }
  return merged;
}

/** All commission partners — anyone who pays Candid (pay sources + bank deposit sources). */
export function getAllCommissionPaySources(partners: PartnerSupplierRecord[] = []): string[] {
  const seen = new Map<string, string>();

  const add = (raw: string) => {
    const trimmed = normalizePaySource(raw);
    if (!trimmed) return;
    const canonical = canonicalPaySource(trimmed);
    const key = commissionSourceKey(canonical);
    if (!seen.has(key)) seen.set(key, canonical);
  };

  for (const opt of PAY_SOURCE_OPTIONS) add(opt);
  for (const deal of getBmwDeals()) {
    if (deal.paySource) add(deal.paySource);
  }
  for (const partner of partners) {
    add(partner.display_name ?? partner.name);
    for (const alias of partner.bank_source_aliases) add(alias);
  }

  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export type CommissionPartnerRow = {
  paySource: string;
  partner: PartnerSupplierRecord | null;
  hasResidualImport: boolean;
  bankOrigCoName: string | null;
  bankOrigId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  commissionRate: number | null;
};

export function buildCommissionPartnerRows(
  partners: PartnerSupplierRecord[],
): CommissionPartnerRow[] {
  const paySources = getAllCommissionPaySources(partners);

  return paySources.map((paySource) => {
    const key = commissionSourceKey(paySource);
    const partner =
      partners.find((p) => commissionSourceKey(p.display_name ?? p.name) === key) ??
      partners.find((p) => p.bank_source_aliases.some((a) => commissionSourceKey(a) === key)) ??
      partners.find((p) => commissionSourceKey(p.name) === key) ??
      null;

    return {
      paySource,
      partner,
      hasResidualImport: Boolean(partner?.supplier_key),
      bankOrigCoName: partner?.bank_orig_co_name ?? null,
      bankOrigId: partner?.bank_orig_id ?? null,
      contactName: partner?.contact_name ?? null,
      contactEmail: partner?.contact_email ?? null,
      contactPhone: partner?.contact_phone ?? null,
      commissionRate: partner?.commission_rate ?? null,
    };
  });
}

/** Match BMW deals to a commission partner pay source. */
export function dealsForPaySource(paySource: string) {
  const key = commissionSourceKey(paySource);
  return getBmwDeals().filter((d) => commissionSourceKey(d.paySource) === key);
}
