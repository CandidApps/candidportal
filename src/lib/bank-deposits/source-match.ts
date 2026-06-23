import type { ParsedChaseRow } from '@/lib/bank-deposits/chase-parse';
import type { SupplierId } from '@/lib/commissions/supplier-config';
import { SUPPLIER_LABELS } from '@/lib/commissions/supplier-config';

export type PartnerSupplierRecord = {
  id: number;
  name: string;
  display_name: string | null;
  supplier_key: string | null;
  bank_orig_co_name: string | null;
  bank_orig_id: string | null;
  bank_source_aliases: string[];
  commission_rate: number | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  notes: string | null;
  provider_category: string | null;
};

/** Hard-coded fallbacks when partner registry is empty. */
const ORIG_CO_NAME_HINTS: Array<{ pattern: RegExp; supplierKey: SupplierId | null; label: string }> = [
  { pattern: /paymentcloud/i, supplierKey: 'paymentcloud', label: 'PaymentCloud' },
  { pattern: /appdirect/i, supplierKey: 'appdirect', label: 'AppDirect' },
  { pattern: /payjunction/i, supplierKey: 'payjunction', label: 'PayJunction' },
  { pattern: /intelisys/i, supplierKey: 'intelisys', label: 'Intelisys' },
  { pattern: /telarus/i, supplierKey: 'telarus', label: 'Telarus' },
  { pattern: /sandler/i, supplierKey: 'sandlerpartners', label: 'Sandler Partners' },
  { pattern: /nuvei/i, supplierKey: 'nuvei', label: 'Nuvei' },
  { pattern: /cg reseller|checkcommerce/i, supplierKey: 'checkcommerce', label: 'CheckCommerce' },
  { pattern: /global payments/i, supplierKey: 'vendara', label: 'Vendara' },
  { pattern: /mango voice|mango/i, supplierKey: 'mango', label: 'Mango' },
  { pattern: /weave communicat|weave/i, supplierKey: 'weave', label: 'Weave' },
  { pattern: /cardconnect|fiserv/i, supplierKey: 'cardconnect', label: 'CardConnect' },
  { pattern: /tek partners/i, supplierKey: null, label: 'TekSystems' },
  { pattern: /corporate it/i, supplierKey: null, label: 'CorpIT' },
  { pattern: /linked2pay/i, supplierKey: null, label: 'Linked2Pay' },
  { pattern: /stripe|zoho|kingsley gate|lendingclub/i, supplierKey: null, label: 'Candid' },
];

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function findPartnerByOrigId(partners: PartnerSupplierRecord[], origId: string | null): PartnerSupplierRecord | null {
  if (!origId) return null;
  return partners.find((p) => p.bank_orig_id === origId) ?? null;
}

function findPartnerByOrigName(partners: PartnerSupplierRecord[], origCoName: string | null): PartnerSupplierRecord | null {
  if (!origCoName) return null;
  const n = norm(origCoName);
  return (
    partners.find((p) => norm(p.bank_orig_co_name) === n) ??
    partners.find((p) => norm(p.bank_orig_co_name) && n.includes(norm(p.bank_orig_co_name)!)) ??
    null
  );
}

function findPartnerByAlias(partners: PartnerSupplierRecord[], alias: string | null): PartnerSupplierRecord | null {
  if (!alias) return null;
  const n = norm(alias);
  return partners.find((p) => p.bank_source_aliases.some((a) => norm(a) === n)) ?? null;
}

function findPartnerBySupplierKey(partners: PartnerSupplierRecord[], key: SupplierId): PartnerSupplierRecord | null {
  return partners.find((p) => p.supplier_key === key) ?? null;
}

export type SourceMatchResult = {
  partnerId: number | null;
  supplierKey: SupplierId | null;
  sourceMatchLabel: string;
  confidence: 'high' | 'medium' | 'low';
};

export function inferSourceMatch(
  row: ParsedChaseRow,
  partners: PartnerSupplierRecord[],
): SourceMatchResult {
  if (row.sheetSource) {
    const byAlias = findPartnerByAlias(partners, row.sheetSource);
    if (byAlias) {
      return {
        partnerId: byAlias.id,
        supplierKey: (byAlias.supplier_key as SupplierId | null) ?? null,
        sourceMatchLabel: byAlias.display_name ?? byAlias.name,
        confidence: 'high',
      };
    }
  }

  const byOrigId = findPartnerByOrigId(partners, row.origId);
  if (byOrigId) {
    return {
      partnerId: byOrigId.id,
      supplierKey: (byOrigId.supplier_key as SupplierId | null) ?? null,
      sourceMatchLabel: byOrigId.display_name ?? byOrigId.name,
      confidence: 'high',
    };
  }

  const byOrigName = findPartnerByOrigName(partners, row.origCoName);
  if (byOrigName) {
    return {
      partnerId: byOrigName.id,
      supplierKey: (byOrigName.supplier_key as SupplierId | null) ?? null,
      sourceMatchLabel: byOrigName.display_name ?? byOrigName.name,
      confidence: 'high',
    };
  }

  const haystack = `${row.description} ${row.origCoName ?? ''} ${row.sheetSource ?? ''}`;
  for (const hint of ORIG_CO_NAME_HINTS) {
    if (!hint.pattern.test(haystack)) continue;
    const partner = hint.supplierKey ? findPartnerBySupplierKey(partners, hint.supplierKey) : findPartnerByAlias(partners, hint.label);
    return {
      partnerId: partner?.id ?? null,
      supplierKey: hint.supplierKey,
      sourceMatchLabel: hint.label,
      confidence: 'medium',
    };
  }

  if (row.sheetSource) {
    return {
      partnerId: null,
      supplierKey: null,
      sourceMatchLabel: row.sheetSource,
      confidence: 'low',
    };
  }

  return {
    partnerId: null,
    supplierKey: null,
    sourceMatchLabel: 'Unmatched',
    confidence: 'low',
  };
}

export function supplierLabelForKey(key: SupplierId | null): string {
  if (!key) return '—';
  return SUPPLIER_LABELS[key] ?? key;
}

export const DEPOSIT_TYPE_OPTIONS = [
  'Commission',
  'Paid Invoice',
  'Passthrough',
  'Other',
] as const;

export type DepositTypeOption = (typeof DEPOSIT_TYPE_OPTIONS)[number];
