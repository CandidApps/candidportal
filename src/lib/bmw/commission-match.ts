import { addedDealToBmwDeal, getAddedDeals } from '@/lib/bmw/added-deals';
import { normalizeUid } from '@/lib/bmw/deal-key';
import { buildDealIndexes } from '@/lib/bmw/deal-master';
import type { BmwDeal } from '@/lib/bmw/types';
import type { SupplierId } from '@/lib/commissions/supplier-config';
import { cell, type SheetRow } from '@/lib/spreadsheet-io';

function supplierUidIndex() {
  return buildDealIndexes().bySupplierUid;
}

/** Commission row fields to try matching against Deal_UID, per supplier. */
const SUPPLIER_MATCH_FIELDS: Record<SupplierId, string[]> = {
  paymentcloud: ['MID', 'mid'],
  payjunction: ['mid', 'MID'],
  cardconnect: ['mid', 'MID'],
  appdirect: [
    'Account Number',
    'account_num',
    'account_number',
    'master_order_number',
    'source_uuid',
    'line_id',
    'service_id',
  ],
  // Prefer Account (e.g. O-32212092). Do not use customer_id — Intelisys stores a name there.
  intelisys: ['Account', 'account', 'account_number', 'order_id'],
  telarus: [
    'order_id',
    'order id',
    'order #',
    'order number',
    'partner_order_id',
    'partner order id',
    'vendor_account',
    'vendor account',
    'customer_id',
    'customer id',
  ],
  sandlerpartners: ['account_number', 'provider_identifier', 'provider_account', 'customer'],
  nuvei: ['mid', 'MID'],
  checkcommerce: ['mid', 'MID'],
  vendara: ['merchant_mid', 'order_id', 'mid'],
  mango: ['account_num', 'account_number'],
  weave: ['partner_object_name', 'customer'],
};

function rowCell(row: Record<string, unknown>, field: string): string {
  return cell(row as SheetRow, field);
}

function rowValues(row: Record<string, unknown>, fields: string[]): string[] {
  const values: string[] = [];
  for (const field of fields) {
    const v = rowCell(row, field);
    if (!v) continue;
    values.push(normalizeUid(v));
  }
  return values;
}

/** Scan every cell on manual uploads where column names may not match our aliases. */
function rowValuesFromAnyCell(row: Record<string, unknown>): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const v of Object.values(row)) {
    if (v == null || v === '' || typeof v === 'boolean') continue;
    const n = normalizeUid(v);
    if (!n || n.length < 4 || seen.has(n)) continue;
    if (/^\d{4}-\d{2}(-\d{2})?$/.test(n)) continue;
    seen.add(n);
    values.push(n);
  }
  return values;
}

export type CommissionRowMatchOpts = {
  uidField?: string | null;
  customerField?: string | null;
};

/** First identifier value found on a commission row (MID, account number, …). */
export function commissionRowUid(
  supplier: SupplierId,
  row: Record<string, unknown>,
  opts?: CommissionRowMatchOpts | string | null,
): string {
  const uidField = typeof opts === 'string' ? opts : opts?.uidField;
  if (uidField?.trim()) {
    const mapped = rowCell(row, uidField);
    if (mapped) return mapped;
    const direct = row[uidField];
    if (direct != null && direct !== '') return String(direct).trim();
  }
  for (const field of SUPPLIER_MATCH_FIELDS[supplier]) {
    const v = rowCell(row, field);
    if (v) return v;
  }
  return '';
}

const CUSTOMER_NAME_FIELDS = [
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

/** Best-effort customer/merchant name from a commission row. */
export function commissionRowCustomer(
  row: Record<string, unknown>,
  customerField?: string | null,
): string {
  if (customerField?.trim()) {
    const mapped = rowCell(row, customerField);
    if (mapped) return mapped;
    const direct = row[customerField];
    if (direct != null && direct !== '') return String(direct).trim();
  }
  for (const field of CUSTOMER_NAME_FIELDS) {
    const v = rowCell(row, field);
    if (v) return v;
  }
  return '';
}

function pickIndexedDeal(deals: BmwDeal[]): BmwDeal | null {
  if (!deals.length) return null;
  if (deals.length === 1) return deals[0]!;
  return deals.find((d) => d.activeDeal) ?? deals[0]!;
}

export function matchDealToCommissionRow(
  supplier: SupplierId,
  row: Record<string, unknown>,
  opts?: CommissionRowMatchOpts,
): BmwDeal | null {
  const fields = opts?.uidField?.trim()
    ? [opts.uidField, ...SUPPLIER_MATCH_FIELDS[supplier]]
    : SUPPLIER_MATCH_FIELDS[supplier];
  const candidates = rowValues(row, fields);

  for (const value of candidates) {
    const key = `${supplier}::${value}`;
    const deals = supplierUidIndex().get(key);
    const picked = deals ? pickIndexedDeal(deals) : null;
    if (picked) return picked;
  }

  for (const value of rowValuesFromAnyCell(row)) {
    const key = `${supplier}::${value}`;
    const deals = supplierUidIndex().get(key);
    const picked = deals ? pickIndexedDeal(deals) : null;
    if (picked) return picked;
  }

  // Fallback: merchant name match for Telarus / Sandler
  if (supplier === 'telarus' || supplier === 'sandlerpartners') {
    const customerName = normalizeUid(commissionRowCustomer(row, opts?.customerField));
    if (customerName) {
      for (const deals of supplierUidIndex().values()) {
        for (const deal of deals) {
          if (normalizeUid(deal.merchant) === customerName) return deal;
        }
      }
    }
  }

  const added = findAddedDealForRow(supplier, row, opts);
  if (added) return addedDealToBmwDeal(added);

  return null;
}

function findAddedDealForRow(
  supplier: SupplierId,
  row: Record<string, unknown>,
  opts?: CommissionRowMatchOpts,
) {
  const deals = getAddedDeals().filter((d) => d.supplier === supplier);
  if (!deals.length) return null;

  const fields = opts?.uidField?.trim()
    ? [opts.uidField, ...SUPPLIER_MATCH_FIELDS[supplier]]
    : SUPPLIER_MATCH_FIELDS[supplier];
  for (const value of rowValues(row, fields)) {
    const match = deals.find((d) => normalizeUid(d.dealUid) === value);
    if (match) return match;
  }

  const name = normalizeUid(commissionRowCustomer(row, opts?.customerField));
  if (name) {
    return deals.find((d) => normalizeUid(d.merchant) === name) ?? null;
  }

  return null;
}
