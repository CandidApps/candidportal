/** Customer documents & Candid contract record types (UI layer until Supabase). */

export type RecordKind =
  | 'statement'
  | 'statement_for_analysis'
  | 'invoice'
  | 'proposal'
  | 'candid_contract'
  | 'external_contract'
  | 'other';

export const RECORD_KIND_OPTIONS: { value: RecordKind; label: string; group: string }[] = [
  { value: 'statement', label: 'Statement', group: 'Billing' },
  { value: 'statement_for_analysis', label: 'Statement for Analysis', group: 'Billing' },
  { value: 'invoice', label: 'Invoice', group: 'Billing' },
  { value: 'proposal', label: 'Proposal', group: 'Sales' },
  { value: 'candid_contract', label: 'Contract with Candid', group: 'Contracts' },
  { value: 'external_contract', label: 'External Contract', group: 'Contracts' },
  { value: 'other', label: 'Other', group: 'Other' },
];

export const PAY_SOURCE_OPTIONS = [
  'Telarus',
  'AppDirect',
  'TekSystems',
  'Mango',
  'Nuvei',
  'Linked2Pay',
  'Vendara',
  'CheckCommerce',
  'Intelisys',
  'Weave',
  'Paya',
  'Fiserv CardConnect',
  'Candid',
  'Finical',
  'CorpIT',
  'Sandler',
  'PaymentCloud',
  'PayJunction',
  'PaySafe',
  'Global Payments',
] as const;

export type PaySource = (typeof PAY_SOURCE_OPTIONS)[number];

export type DealStatus =
  | 'active'
  | 'pending'
  | 'expiring'
  | 'expired'
  | 'cancelled'
  | 'draft';

export const DEAL_STATUS_OPTIONS: { value: DealStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'expiring', label: 'Expiring' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'draft', label: 'Draft' },
];

/** Parsed / manual Candid contract fields */
export type ServiceBreakdownLine = {
  qty?: number;
  unit_price?: number;
  subtotal?: number;
};

export type ServiceBreakdown = Record<string, number | string | ServiceBreakdownLine | null | undefined>;

export type PortingInfo = {
  number_ported?: string;
  ported_from?: string;
  comcast_account?: string;
  loa_signed_by?: string;
  port_date?: string;
  [key: string]: string | undefined;
};

export type CandidContractRecord = {
  id: string;
  customerId: string;
  locationId: string;
  dealId?: string;
  agentCommId?: string;
  agentOfRecord?: string;
  /** Agent commission tier (%). */
  agentCommissionRate?: number;
  paySource?: string;
  /** BMW Provider — actual solution vendor (e.g. For2Fi). */
  solution?: string;
  service?: string;
  product?: string;
  solutionDescription?: string;
  /** Line-item MRC breakdown from portal import (extensions, fees, taxes, etc.). */
  serviceBreakdown?: ServiceBreakdown;
  portingInfo?: PortingInfo;
  salesOrderRef?: string;
  salesOrderNum?: string;
  providerAccountNum?: string;
  isCandid?: boolean;
  annualBilling?: boolean;
  promoMrc?: number;
  yr1Annual?: number;
  yr2Annual?: number;
  contractSignDate?: string;
  contractTermMonths?: number;
  alert60Days?: string;
  renewalNoticeDate?: string;
  contactAtSigning?: string;
  equipmentNote?: string;
  dealNote?: string;
  commissionType?: string;
  commissionAmount?: number;
  mrr?: number;
  mrc?: number;
  estimatedTotalBill?: number;
  dealStatus: DealStatus;
  contractTerms?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  physicalLocationId?: string;
  billingLocationId?: string;
  /** Legacy list display */
  vendor: string;
  monthly: number;
  expires: string;
  autoRenews: boolean;
};

export type CustomerDocument = {
  id: string;
  customerId: string;
  locationId: string;
  filename: string;
  recordKind: RecordKind;
  uploadedBy: string;
  date: string;
  size: string;
  /** Linked Candid contract when kind is candid_contract */
  contractId?: string;
  /** Portal import provider tag for matching contracts to files */
  provider?: string;
  /** Portal doc_subtype (Sales Order, LOA, Merchant Statement, etc.) */
  docSubtype?: string;
  signedDate?: string | null;
  signedBy?: string;
  invoiceDate?: string | null;
  amount?: number | null;
  roiNote?: string;
  description?: string;
  onedrivePath?: string;
  docLocation?: string;
  docStatus?: string;
  /** Supabase Storage path in candid_documents bucket */
  storagePath?: string;
};

/** Best-effort parse contract-ish fields from filename / placeholder for future OCR */
export function parseContractHintsFromFile(file: File): Partial<CandidContractRecord> {
  const name = file.name;
  const hints: Partial<CandidContractRecord> = {};
  const dealMatch = name.match(/deal[_\-\s]?(\w+)/i);
  if (dealMatch) hints.dealId = dealMatch[1];
  const mrrMatch = name.match(/mrr[_\-\s]?(\d+)/i);
  if (mrrMatch) hints.mrr = Number(mrrMatch[1]);
  const dateMatch = name.match(/(20\d{2})[-_]?(\d{2})/);
  if (dateMatch) hints.contractStartDate = `${dateMatch[1]}-${dateMatch[2]}-01`;
  return hints;
}

export function recordKindLabel(kind: RecordKind): string {
  return RECORD_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? kind;
}

export function recordKindToLegacyFileType(kind: RecordKind): 'contract' | 'invoice' | 'proposal' | 'statement' | 'other' {
  if (kind === 'invoice') return 'invoice';
  if (kind === 'proposal') return 'proposal';
  if (kind === 'statement' || kind === 'statement_for_analysis') return 'statement';
  if (kind === 'candid_contract' || kind === 'external_contract') return 'contract';
  return 'other';
}
