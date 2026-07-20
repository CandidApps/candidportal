import {
  amountFieldForSupplier,
  type SupplierId,
  type SupplierImportBatch,
} from '@/lib/commissions/supplier-config';
import { normalizeHeader } from '@/lib/spreadsheet-io';

export type SupplierColumnAliases = {
  dealUid: string[];
  customer: string[];
  amount: string[];
  period: string[];
};

const DEFAULT_CUSTOMER = [
  'customer',
  'customer_name',
  'DBAName',
  'dba_name',
  'dba',
  'company_dba',
  'company_name',
  'merchant_name',
  'partner_object_name',
  'legal',
];

const SUPPLIER_COLUMN_ALIASES: Partial<Record<SupplierId, Partial<SupplierColumnAliases>>> = {
  paymentcloud: { dealUid: ['MID', 'mid'] },
  payjunction: { dealUid: ['mid', 'MID'] },
  cardconnect: { dealUid: ['mid', 'MID'] },
  appdirect: {
    dealUid: ['Account Number', 'account_number', 'account_num', 'master_order_number'],
  },
  intelisys: {
    // Account holds IDs like O-32212092. customer_id is a display name in Intelisys exports.
    dealUid: ['Account', 'account', 'account_number', 'order_id'],
    customer: ['customer', 'customer_name', 'customer_id', 'company'],
  },
  telarus: {
    dealUid: ['order_id', 'order id', 'customer_id', 'vendor_account', 'vendor account'],
  },
  sandlerpartners: {
    dealUid: ['account_number', 'provider_identifier', 'provider_account'],
  },
  nuvei: { dealUid: ['mid', 'MID'] },
  checkcommerce: { dealUid: ['mid', 'MID'] },
  vendara: { dealUid: ['merchant_mid', 'order_id', 'mid'] },
  mango: { dealUid: ['account_num', 'account_number'] },
  weave: { dealUid: ['partner_object_name', 'customer'] },
};

export function supplierColumnAliases(supplier: SupplierId): SupplierColumnAliases {
  const configured = amountFieldForSupplier(supplier);
  const overrides = SUPPLIER_COLUMN_ALIASES[supplier] ?? {};
  return {
    dealUid: overrides.dealUid ?? ['deal_uid', 'uid', 'id'],
    customer: overrides.customer ?? DEFAULT_CUSTOMER,
    amount: overrides.amount ?? [configured, 'amount', 'commission', 'comp_paid', 'sales_comm'],
    period: overrides.period ?? ['period', 'commission_month', 'billing_month', 'payment_month'],
  };
}

export function pickSpreadsheetColumn(headers: string[], aliases: string[]): string {
  for (const alias of aliases) {
    const target = normalizeHeader(alias);
    const match = headers.find((h) => normalizeHeader(h) === target);
    if (match) return match;
  }
  return '';
}

export function suggestSupplierColumnMapping(
  supplier: SupplierId,
  headers: string[],
): {
  dealUidField: string;
  customerField: string;
  amountField: string;
  periodField: string;
} {
  const aliases = supplierColumnAliases(supplier);
  return {
    dealUidField: pickSpreadsheetColumn(headers, aliases.dealUid),
    customerField: pickSpreadsheetColumn(headers, aliases.customer),
    amountField: pickSpreadsheetColumn(headers, aliases.amount),
    periodField: pickSpreadsheetColumn(headers, aliases.period),
  };
}

export function rowValueFromColumn(
  row: Record<string, unknown>,
  field: string,
): string {
  if (!field) return '';
  const v = row[field];
  if (v == null || v === '') return '';
  return String(v).trim();
}

/** Distinct non-empty sample values from a column (for mapping confirmation UI). */
export function sampleColumnValues(
  rows: Record<string, unknown>[],
  field: string,
  limit = 3,
): string[] {
  if (!field || !rows.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const v = rowValueFromColumn(row, field);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

export type ResolvedSupplierColumnMapping = {
  dealUidField: string;
  customerField: string;
  amountField: string;
};

/** Resolve effective column mapping for a batch (overrides → batch fields → auto-suggest). */
export function resolveBatchColumnMapping(
  supplier: SupplierId,
  rows: Record<string, unknown>[],
  current?: {
    uidField?: string | null;
    customerField?: string | null;
    amountField?: string | null;
  },
): ResolvedSupplierColumnMapping {
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const suggested = headers.length
    ? suggestSupplierColumnMapping(supplier, headers)
    : { dealUidField: '', customerField: '', amountField: amountFieldForSupplier(supplier), periodField: '' };

  const pickExisting = (wanted: string | null | undefined): string => {
    if (!wanted?.trim() || !headers.length) return wanted?.trim() ?? '';
    const target = normalizeHeader(wanted);
    return headers.find((h) => normalizeHeader(h) === target) ?? wanted.trim();
  };

  return {
    dealUidField: pickExisting(current?.uidField) || suggested.dealUidField,
    customerField: pickExisting(current?.customerField) || suggested.customerField,
    amountField:
      pickExisting(current?.amountField) ||
      suggested.amountField ||
      amountFieldForSupplier(supplier),
  };
}

export function batchRowMatchOpts(
  batch: Pick<SupplierImportBatch, 'uidField' | 'customerField'>,
): { uidField?: string | null; customerField?: string | null } {
  return { uidField: batch.uidField, customerField: batch.customerField };
}
