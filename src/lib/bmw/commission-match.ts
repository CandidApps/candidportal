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
  appdirect: ['source_uuid', 'account_num', 'account_num', 'customer', 'line_id', 'service_id'],
  intelisys: ['customer_id', 'account_number', 'customer', 'mid'],
  telarus: [
    'order_id',
    'order id',
    'order #',
    'order number',
    'customer_id',
    'customer id',
    'vendor_account',
    'vendor account',
  ],
  sandlerpartners: ['account_number', 'provider_identifier', 'customer'],
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

/** First identifier value found on a commission row (MID, account number, …). */
export function commissionRowUid(supplier: SupplierId, row: Record<string, unknown>): string {
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
export function commissionRowCustomer(row: Record<string, unknown>): string {
  for (const field of CUSTOMER_NAME_FIELDS) {
    const v = rowCell(row, field);
    if (v) return v;
  }
  return '';
}

export function matchDealToCommissionRow(
  supplier: SupplierId,
  row: Record<string, unknown>,
): BmwDeal | null {
  const fields = SUPPLIER_MATCH_FIELDS[supplier];
  const candidates = rowValues(row, fields);

  for (const value of candidates) {
    const key = `${supplier}::${value}`;
    const deals = supplierUidIndex().get(key);
    if (deals?.length === 1) return deals[0]!;
    if (deals && deals.length > 1) {
      // Prefer active deal when multiple match same UID
      return deals.find((d) => d.activeDeal) ?? deals[0]!;
    }
  }

  // Fallback: merchant name match for Telarus / Sandler
  const customerName = normalizeUid(commissionRowCustomer(row));
  if (customerName) {
    for (const deals of supplierUidIndex().values()) {
      for (const deal of deals) {
        if (normalizeUid(deal.merchant) === customerName) return deal;
      }
    }
  }

  const added = findAddedDealForRow(supplier, row);
  if (added) return addedDealToBmwDeal(added);

  return null;
}

function findAddedDealForRow(
  supplier: SupplierId,
  row: Record<string, unknown>,
) {
  const deals = getAddedDeals().filter((d) => d.supplier === supplier);
  if (!deals.length) return null;

  const fields = SUPPLIER_MATCH_FIELDS[supplier];
  for (const value of rowValues(row, fields)) {
    const match = deals.find((d) => normalizeUid(d.dealUid) === value);
    if (match) return match;
  }

  const name = normalizeUid(commissionRowCustomer(row));
  if (name) {
    return deals.find((d) => normalizeUid(d.merchant) === name) ?? null;
  }

  return null;
}
