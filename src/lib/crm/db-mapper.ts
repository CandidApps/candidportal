import type { Contact, Customer, Location } from '@/components/CustomersView';
import type { CandidContractRecord, CustomerDocument } from '@/lib/customer-records';
import type { CustomerPortalData } from '@/lib/portal-import/merge';
import type { CrmSnapshot } from '@/lib/crm/snapshot';
import { normalizeWebsiteUrlOrNull } from '@/lib/crm/website';

export type DbCustomerRow = {
  id: string;
  external_id: string;
  company: string;
  company_legal: string | null;
  industry: string | null;
  description: string | null;
  website: string | null;
  alt_website: string | null;
  linkedin_url: string | null;
  tax_id: string | null;
  mcc_code: string | null;
  corp_type: string | null;
  notes: string | null;
  status: string;
  agent: string;
  spend: number;
  savings: number;
  contracts_count: number;
  files_count: number;
  since_label: string | null;
  bmw_merchant_name: string | null;
  portal_import_customer_id: string | null;
  portal_data: CustomerPortalData | null;
  archived_at: string | null;
};

export type DbLocationRow = {
  id: string;
  customer_id: string;
  external_id: string;
  label: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  is_primary: boolean;
};

export type DbContactRow = {
  id: string;
  customer_id: string;
  external_id: string;
  name: string;
  role: string;
  email: string;
  alt_email: string | null;
  phone: string;
  is_primary: boolean;
  ownership_pct: number | null;
  location_ids: string[];
  crm_notes: string | null;
  portal_access: boolean;
  portal_access_tier: string | null;
  portal_invite_sent_at: string | null;
  extra: Record<string, unknown> | null;
};

export type DbDealRow = {
  id: string;
  customer_id: string;
  external_id: string;
  deal_uid: string | null;
  deal_id: string | null;
  pay_source: string | null;
  provider: string | null;
  product: string | null;
  location_external_id: string | null;
  deal_status: string;
  monthly_cost: number | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  contract_data: CandidContractRecord;
};

export type DbRecordRow = {
  id: string;
  customer_id: string;
  deal_id: string | null;
  external_id: string;
  location_external_id: string | null;
  record_kind: string;
  filename: string;
  storage_path: string | null;
  local_filename: string | null;
  uploaded_by: string | null;
  display_date: string | null;
  file_size_label: string | null;
  provider: string | null;
  doc_subtype: string | null;
  signed_date: string | null;
  amount: number | null;
  roi_note: string | null;
  description: string | null;
  onedrive_path: string | null;
  visible_in_portal: boolean;
  document_data: Partial<CustomerDocument>;
};

export function customerToRow(customer: Customer): Omit<DbCustomerRow, 'id'> {
  return {
    external_id: customer.id,
    company: customer.company,
    company_legal: customer.companyLegal ?? null,
    industry: customer.industry ?? null,
    description: customer.description ?? null,
    website: normalizeWebsiteUrlOrNull(customer.website),
    alt_website: normalizeWebsiteUrlOrNull(customer.altWebsite),
    linkedin_url: customer.linkedinUrl ?? null,
    tax_id: customer.taxId ?? null,
    mcc_code: customer.mccCode ?? null,
    corp_type: customer.corpType ?? null,
    notes: customer.notes ?? null,
    status: customer.status,
    agent: customer.agent,
    spend: customer.spend,
    savings: customer.savings,
    contracts_count: customer.contracts,
    files_count: customer.files,
    since_label: customer.since,
    bmw_merchant_name: customer.portal?.bmwMerchantName ?? null,
    portal_import_customer_id: customer.portal?.importCustomerId ?? null,
    portal_data: customer.portal ?? null,
    archived_at: customer.archivedAt ?? null,
  };
}

export function locationToRow(customerId: string, location: Location): Omit<DbLocationRow, 'id'> {
  return {
    customer_id: customerId,
    external_id: location.id,
    label: location.label,
    street: location.street,
    city: location.city,
    state: location.state,
    zip: location.zip,
    is_primary: location.isPrimary,
  };
}

export function contactToRow(customerId: string, contact: Contact): Omit<DbContactRow, 'id'> {
  return {
    customer_id: customerId,
    external_id: contact.id,
    name: contact.name,
    role: contact.role,
    email: contact.email,
    alt_email: contact.altEmail?.trim() || null,
    phone: contact.phone,
    is_primary: contact.isPrimary,
    ownership_pct: contact.ownershipPct ?? null,
    location_ids: contact.locationIds ?? [],
    crm_notes: contact.crmNotes ?? null,
    portal_access: contact.portalAccess ?? false,
    portal_access_tier: contact.portalAccessTier ?? null,
    portal_invite_sent_at: contact.portalInviteSentAt ?? null,
    extra: contact.recentEmails?.length ? { recentEmails: contact.recentEmails } : null,
  };
}

export function crmRecordExternalId(customerExternalId: string, docId: string): string {
  return `${customerExternalId}::${docId}`;
}

export function contractToDealRow(
  customerUuid: string,
  contract: CandidContractRecord,
): Omit<DbDealRow, 'id'> {
  const { id, customerId, locationId, ...rest } = contract;
  return {
    customer_id: customerUuid,
    external_id: id,
    deal_uid: contract.dealId ?? null,
    deal_id: contract.dealId ?? null,
    pay_source: contract.paySource ?? null,
    provider: contract.vendor ?? contract.solution ?? null,
    product: contract.product ?? null,
    location_external_id: locationId || null,
    deal_status: contract.dealStatus,
    monthly_cost: contract.monthly ?? contract.mrc ?? null,
    contract_start_date: contract.contractStartDate ?? null,
    contract_end_date: contract.contractEndDate ?? null,
    contract_data: contract,
  };
}

export function documentToRecordRow(
  customerUuid: string,
  doc: CustomerDocument,
  dealUuid?: string | null,
): Omit<DbRecordRow, 'id'> & { deal_id?: string | null } {
  return {
    customer_id: customerUuid,
    deal_id: dealUuid ?? null,
    external_id: doc.id,
    location_external_id: doc.locationId || null,
    record_kind: doc.recordKind,
    filename: doc.filename,
    storage_path: doc.storagePath ?? null,
    local_filename: doc.filename,
    uploaded_by: doc.uploadedBy ?? null,
    display_date: doc.date ?? null,
    file_size_label: doc.size ?? null,
    provider: doc.provider ?? null,
    doc_subtype: doc.docSubtype ?? null,
    signed_date: doc.signedDate ?? null,
    amount: doc.amount ?? null,
    roi_note: doc.roiNote ?? null,
    description: doc.description ?? null,
    onedrive_path: doc.onedrivePath ?? null,
    visible_in_portal: true,
    document_data: doc,
  };
}

export type CrmImportPayload = {
  customers: Array<Omit<DbCustomerRow, 'id'>>;
  locations: Array<{ customerExternalId: string; row: Omit<DbLocationRow, 'id' | 'customer_id'> }>;
  contacts: Array<{ customerExternalId: string; row: Omit<DbContactRow, 'id' | 'customer_id'> }>;
  deals: Array<{ customerExternalId: string; row: Omit<DbDealRow, 'id' | 'customer_id'> }>;
  records: Array<{ customerExternalId: string; row: Omit<DbRecordRow, 'id' | 'customer_id'> }>;
};

export function snapshotToImportPayload(snapshot: CrmSnapshot): CrmImportPayload {
  const customers: CrmImportPayload['customers'] = [];
  const locations: CrmImportPayload['locations'] = [];
  const contacts: CrmImportPayload['contacts'] = [];
  const deals: CrmImportPayload['deals'] = [];
  const records: CrmImportPayload['records'] = [];

  for (const customer of snapshot.customers) {
    customers.push(customerToRow(customer));
    for (const location of customer.locations) {
      const { customer_id: _c, ...row } = locationToRow('', location);
      locations.push({ customerExternalId: customer.id, row });
    }
    for (const contact of customer.contacts) {
      const { customer_id: _c, ...row } = contactToRow('', contact);
      contacts.push({ customerExternalId: customer.id, row });
    }
  }

  for (const [customerExternalId, contracts] of Object.entries(snapshot.contractsByCustomerId)) {
    for (const contract of contracts) {
      const { customer_id: _c, ...row } = contractToDealRow('', contract);
      deals.push({ customerExternalId, row });
    }
  }

  for (const [customerExternalId, docs] of Object.entries(snapshot.documentsByCustomerId)) {
    for (const doc of docs) {
      const { customer_id: _c, ...row } = documentToRecordRow('', doc);
      records.push({
        customerExternalId,
        row: { ...row, external_id: `${customerExternalId}::${doc.id}` },
      });
    }
  }

  return { customers, locations, contacts, deals, records };
}

export function rowsToCustomer(
  row: DbCustomerRow,
  locations: DbLocationRow[],
  contacts: DbContactRow[],
): Customer {
  return {
    id: row.external_id,
    company: row.company,
    companyLegal: row.company_legal ?? undefined,
    industry: row.industry ?? undefined,
    description: row.description ?? undefined,
    website: row.website ?? undefined,
    altWebsite: row.alt_website ?? undefined,
    linkedinUrl: row.linkedin_url ?? undefined,
    taxId: row.tax_id ?? undefined,
    mccCode: row.mcc_code ?? undefined,
    corpType: row.corp_type ?? undefined,
    notes: row.notes ?? undefined,
    status: row.status as Customer['status'],
    agent: row.agent,
    spend: Number(row.spend) || 0,
    savings: Number(row.savings) || 0,
    contracts: row.contracts_count,
    files: row.files_count,
    since: row.since_label ?? 'CRM',
    contacts: contacts.map((c) => ({
      id: c.external_id,
      name: c.name,
      role: c.role,
      email: c.email,
      altEmail: c.alt_email ?? undefined,
      phone: c.phone,
      isPrimary: c.is_primary,
      ownershipPct: c.ownership_pct ?? undefined,
      locationIds: c.location_ids,
      crmNotes: c.crm_notes ?? undefined,
      portalAccess: c.portal_access,
      portalAccessTier: (c.portal_access_tier as Contact['portalAccessTier']) ?? undefined,
      portalInviteSentAt: c.portal_invite_sent_at ?? undefined,
      recentEmails: (c.extra?.recentEmails as Contact['recentEmails']) ?? undefined,
    })),
    locations: locations.map((l) => ({
      id: l.external_id,
      label: l.label,
      street: l.street,
      city: l.city,
      state: l.state,
      zip: l.zip,
      isPrimary: l.is_primary,
    })),
    portal: row.portal_data ?? undefined,
    archivedAt: row.archived_at ?? undefined,
  };
}

function asMoneyNumber(value: unknown, fallback?: unknown): number | undefined {
  for (const candidate of [value, fallback]) {
    if (candidate == null || candidate === '') continue;
    const n = typeof candidate === 'number' ? candidate : Number(candidate);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function dealRowToContract(row: DbDealRow, customerExternalId: string): CandidContractRecord {
  const base = row.contract_data ?? ({} as CandidContractRecord);
  const monthly = asMoneyNumber(row.monthly_cost, base.monthly ?? base.mrc) ?? 0;
  return {
    ...base,
    id: row.external_id,
    customerId: customerExternalId,
    locationId: row.location_external_id ?? base.locationId ?? '',
    dealId: row.deal_id ?? base.dealId,
    paySource: row.pay_source ?? base.paySource,
    vendor: row.provider ?? base.vendor,
    product: row.product ?? base.product,
    dealStatus: (row.deal_status as CandidContractRecord['dealStatus']) ?? base.dealStatus ?? 'active',
    monthly,
    mrc: monthly,
    contractStartDate: row.contract_start_date ?? base.contractStartDate,
    contractEndDate: row.contract_end_date ?? base.contractEndDate,
  };
}

export function recordRowToDocument(row: DbRecordRow, customerExternalId: string): CustomerDocument {
  const base = row.document_data ?? {};
  const docId =
    base.id ??
    (row.external_id.includes('::') ? row.external_id.split('::').slice(1).join('::') : row.external_id);
  return {
    id: docId,
    customerId: customerExternalId,
    locationId: row.location_external_id ?? base.locationId ?? '',
    filename: row.filename,
    recordKind: row.record_kind as CustomerDocument['recordKind'],
    uploadedBy: row.uploaded_by ?? base.uploadedBy ?? 'CRM',
    date: row.display_date ?? base.date ?? '',
    size: row.file_size_label ?? base.size ?? '—',
    contractId: base.contractId,
    provider: row.provider ?? base.provider,
    docSubtype: row.doc_subtype ?? base.docSubtype,
    signedDate: row.signed_date ?? base.signedDate,
    amount: row.amount ?? base.amount,
    roiNote: row.roi_note ?? base.roiNote,
    description: row.description ?? base.description,
    onedrivePath: row.onedrive_path ?? base.onedrivePath,
    storagePath: row.storage_path ?? base.storagePath ?? undefined,
  };
}
