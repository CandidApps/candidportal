import { cellNumber, normalizeHeader, type SheetRow } from '@/lib/spreadsheet-io';

export type SupplierId =
  | 'paymentcloud'
  | 'appdirect'
  | 'cardconnect'
  | 'payjunction'
  | 'intelisys'
  | 'telarus'
  | 'sandlerpartners'
  | 'nuvei'
  | 'checkcommerce'
  | 'vendara'
  | 'mango'
  | 'weave';

export const SUPPLIER_IDS: SupplierId[] = [
  'paymentcloud',
  'appdirect',
  'cardconnect',
  'payjunction',
  'intelisys',
  'telarus',
  'sandlerpartners',
  'nuvei',
  'checkcommerce',
  'vendara',
  'mango',
  'weave',
];

export const SUPPLIER_LABELS: Record<SupplierId, string> = {
  paymentcloud: 'PaymentCloud',
  appdirect: 'AppDirect',
  cardconnect: 'CardConnect',
  payjunction: 'PayJunction',
  intelisys: 'Intelisys',
  telarus: 'Telarus',
  sandlerpartners: 'Sandler Partners',
  nuvei: 'Nuvei',
  checkcommerce: 'CheckCommerce',
  vendara: 'Vendara',
  mango: 'Mango',
  weave: 'Weave',
};

export type SupplierImportBatch = {
  id: string;
  supplier: SupplierId;
  period: string;
  totalAmount: number;
  rowCount: number;
  importedAt: string;
  rows: Record<string, unknown>[];
  /** Manual uploads store the user-selected amount column here. */
  amountField?: string;
};

export type SupplierTableConfig = {
  id: SupplierId;
  table: string;
  periodFields: string[];
  amountField: string;
  importedAtField?: string;
  displayColumns: string[];
};

export const SUPPLIER_CONFIGS: SupplierTableConfig[] = [
  {
    id: 'paymentcloud',
    table: 'PaymentCloud',
    periodFields: ['Period', 'Commission Month', 'Year Month Commissionable Month'],
    amountField: 'Partner Comm',
    displayColumns: ['MID', 'DBAName', 'SalesRep', 'Volume', 'Partner Comm', 'Period'],
  },
  {
    id: 'payjunction',
    table: 'Payjunction',
    periodFields: ['period'],
    amountField: 'amount',
    importedAtField: 'imported_at',
    displayColumns: ['mid', 'dba', 'legal', 'amount', 'period'],
  },
  {
    id: 'appdirect',
    table: 'appdirect_commissions',
    periodFields: ['period', 'report_month'],
    amountField: 'comp_paid',
    displayColumns: [
      'customer',
      'Account Number',
      'account_number',
      'product_name',
      'sales_rep_name',
      'Commission Cycle',
      'commission_cycle',
      'comp_paid',
      'period',
    ],
  },
  {
    id: 'cardconnect',
    table: 'cardconnect_commissions',
    periodFields: ['period'],
    amountField: 'net_commission',
    importedAtField: 'created_at',
    displayColumns: ['mid', 'dba', 'partner', 'net_commission', 'bankcard_volume', 'period'],
  },
  {
    id: 'intelisys',
    table: 'intelisys_commissions',
    periodFields: ['period', 'billing_month'],
    amountField: 'sales_comm',
    importedAtField: 'created_at',
    displayColumns: ['customer', 'product', 'rep', 'sales_comm', 'period'],
  },
  {
    id: 'telarus',
    table: 'telarus_commissions',
    periodFields: ['period', 'payment_month', 'bill_month'],
    amountField: 'total_commission',
    importedAtField: 'created_at',
    displayColumns: [
      'order_id',
      'customer_id',
      'vendor_account',
      'customer',
      'vendor',
      'service_description',
      'total_commission',
      'period',
    ],
  },
  {
    id: 'sandlerpartners',
    table: 'sandlerpartners_commissions',
    periodFields: ['period', 'commission_month'],
    amountField: 'agent_commission',
    importedAtField: 'created_at',
    displayColumns: ['customer', 'provider', 'rep', 'product', 'agent_commission', 'period'],
  },
  {
    id: 'nuvei',
    table: 'nuvei_commissions',
    periodFields: ['period', 'commissionable_month'],
    amountField: 'agent_net',
    importedAtField: 'created_at',
    displayColumns: ['mid', 'dba_name', 'agent_name', 'agent_net', 'period'],
  },
  {
    id: 'checkcommerce',
    table: 'checkcommerce_commissions',
    periodFields: ['period'],
    amountField: 'total',
    importedAtField: 'created_at',
    displayColumns: ['mid', 'company_dba', 'company_name', 'total', 'period'],
  },
  {
    id: 'vendara',
    table: 'vendara_commissions',
    periodFields: ['period'],
    amountField: 'net_residual',
    importedAtField: 'created_at',
    displayColumns: ['merchant_mid', 'merchant_name', 'agent', 'net_residual', 'period'],
  },
  {
    id: 'mango',
    table: 'mango_commissions',
    periodFields: ['period', 'commission_month'],
    amountField: 'commission',
    importedAtField: 'created_at',
    displayColumns: ['customer', 'account_num', 'mrc', 'commission_rate', 'commission', 'period'],
  },
  {
    id: 'weave',
    table: 'weave_commissions',
    periodFields: ['period', 'commission_month'],
    amountField: 'payout',
    importedAtField: 'created_at',
    displayColumns: ['partner_object_name', 'payout', 'period', 'commission_month'],
  },
];

const configById = Object.fromEntries(
  SUPPLIER_CONFIGS.map((c) => [c.id, c]),
) as Record<SupplierId, SupplierTableConfig>;

export function amountFieldForSupplier(supplier: SupplierId): string {
  return configById[supplier]?.amountField ?? 'amount';
}

/** Read commission amount using normalized header matching (Comp Paid vs comp_paid). */
export function commissionRowAmount(
  supplier: SupplierId,
  row: Record<string, unknown>,
  amountFieldOverride?: string,
): number {
  const field = amountFieldOverride?.trim() || amountFieldForSupplier(supplier);
  return cellNumber(row as SheetRow, field) ?? 0;
}

export function commissionRowAmountForBatch(
  batch: Pick<SupplierImportBatch, 'supplier' | 'amountField'>,
  row: Record<string, unknown>,
): number {
  const fields = [
    batch.amountField,
    amountFieldForSupplier(batch.supplier),
  ].filter((field): field is string => Boolean(field?.trim()));

  for (const field of fields) {
    const amt = commissionRowAmount(batch.supplier, row, field);
    if (amt !== 0) return amt;
  }

  if (batch.amountField && row[batch.amountField] != null && row[batch.amountField] !== '') {
    const raw = row[batch.amountField];
    const n =
      typeof raw === 'number'
        ? raw
        : Number(String(raw ?? '').replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(n) && n !== 0) return n;
  }

  return 0;
}

export function displayColumnsForSupplier(
  supplier: SupplierId,
  rows: Record<string, unknown>[],
): string[] {
  const preferred = configById[supplier]?.displayColumns ?? [];
  if (!rows.length) return preferred;
  const keys = Object.keys(rows[0]!);
  const pick: string[] = [];
  for (const pref of preferred) {
    const norm = normalizeHeader(pref);
    const match = keys.find((k) => normalizeHeader(k) === norm);
    if (match && !pick.includes(match)) pick.push(match);
  }
  if (pick.length) return pick;
  return keys.filter((k) => !['id', 'created_at', 'imported_at'].includes(k)).slice(0, 8);
}
