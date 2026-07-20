import type { Location, Contact, Customer } from '@/components/CustomersView';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { CandidContractRecord, CustomerDocument } from '@/lib/customer-records';
import {
  contactToRow,
  contractToDealRow,
  customerToRow,
  crmRecordExternalId,
  documentToRecordRow,
  locationToRow,
  type CrmImportPayload,
} from '@/lib/crm/db-mapper';
import { getCrmCustomerUuid } from '@/lib/crm/load-from-db';
import { normalizeWebsiteUrlOrNull } from '@/lib/crm/website';

export type CustomerProfilePersistPatch = {
  website?: string;
  altWebsite?: string | null;
  linkedinUrl?: string;
  mccCode?: string;
  companyLegal?: string | null;
  corpType?: string | null;
  location?: Location;
  company?: string;
  industry?: string | null;
  description?: string | null;
  taxId?: string | null;
  agent?: string;
  status?: Customer['status'];
  notes?: string | null;
  /** Recurring monthly savings shown on the member dashboard ($/mo). */
  savings?: number;
  /** Member-since label shown on the account (e.g. "Jan 2024"). */
  since?: string;
};

export async function persistCrmBulkImport(
  payload: Pick<CrmImportPayload, 'customers' | 'locations' | 'contacts'>,
): Promise<{ customers: number; locations: number; contacts: number }> {
  const admin = createSupabaseAdminClient();
  const batchSize = 100;

  const chunk = <T,>(items: T[]): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) out.push(items.slice(i, i + batchSize));
    return out;
  };

  if (payload.customers.length) {
    for (const batch of chunk(payload.customers)) {
      const { error } = await admin.from('customers').upsert(batch, { onConflict: 'external_id' });
      if (error) throw new Error(error.message);
    }
  }

  const { data: customerRows, error: customerLookupError } = await admin
    .from('customers')
    .select('id, external_id');
  if (customerLookupError) throw new Error(customerLookupError.message);

  const uuidByExternal = new Map((customerRows ?? []).map((r) => [r.external_id as string, r.id as string]));

  const locations = payload.locations
    .map(({ customerExternalId, row }) => {
      const customerId = uuidByExternal.get(customerExternalId);
      if (!customerId) return null;
      return { ...row, customer_id: customerId };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const contacts = payload.contacts
    .map(({ customerExternalId, row }) => {
      const customerId = uuidByExternal.get(customerExternalId);
      if (!customerId) return null;
      return { customerExternalId, customerId, row: { ...row, customer_id: customerId } };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (locations.length) {
    for (const batch of chunk(locations)) {
      const { error } = await admin
        .from('customer_locations')
        .upsert(batch, { onConflict: 'customer_id,external_id' });
      if (error) throw new Error(error.message);
    }

    const primaryByCustomer = new Map<string, string>();
    for (const loc of locations) {
      if (loc.is_primary) primaryByCustomer.set(loc.customer_id, loc.external_id);
    }
    for (const [customerId, externalId] of primaryByCustomer) {
      await admin
        .from('customer_locations')
        .update({ is_primary: false })
        .eq('customer_id', customerId)
        .neq('external_id', externalId);
      await admin
        .from('customer_locations')
        .update({ is_primary: true })
        .eq('customer_id', customerId)
        .eq('external_id', externalId);
    }
  }

  if (contacts.length) {
    for (const batch of chunk(contacts.map((c) => c.row))) {
      const { error } = await admin
        .from('customer_contacts')
        .upsert(batch, { onConflict: 'customer_id,external_id' });
      if (error) throw new Error(error.message);
    }

    const primaryByCustomer = new Map<string, string>();
    for (const contact of contacts) {
      if (contact.row.is_primary) primaryByCustomer.set(contact.customerId, contact.row.external_id);
    }
    for (const [customerId, externalId] of primaryByCustomer) {
      await admin
        .from('customer_contacts')
        .update({ is_primary: false })
        .eq('customer_id', customerId)
        .neq('external_id', externalId);
      await admin
        .from('customer_contacts')
        .update({ is_primary: true })
        .eq('customer_id', customerId)
        .eq('external_id', externalId);
    }
  }

  return {
    customers: payload.customers.length,
    locations: locations.length,
    contacts: contacts.length,
  };
}

export async function persistCustomerRecord(params: {
  customerExternalId: string;
  document?: CustomerDocument;
  contract?: CandidContractRecord;
}): Promise<void> {
  const customerUuid = await getCrmCustomerUuid(params.customerExternalId);
  if (!customerUuid) {
    throw new Error(`Customer not found: ${params.customerExternalId}`);
  }
  if (!params.document && !params.contract) {
    throw new Error('document or contract required');
  }

  const admin = createSupabaseAdminClient();
  let dealUuid: string | null = null;

  if (params.contract) {
    const dealRow = contractToDealRow(customerUuid, params.contract);
    const { data, error } = await admin
      .from('deals')
      .upsert(dealRow, { onConflict: 'external_id' })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    dealUuid = data?.id ?? null;
  } else if (params.document?.contractId) {
    const { data: linkedDeal, error: dealLookupError } = await admin
      .from('deals')
      .select('id')
      .eq('external_id', params.document.contractId)
      .eq('customer_id', customerUuid)
      .maybeSingle();
    if (dealLookupError) throw new Error(dealLookupError.message);
    dealUuid = linkedDeal?.id ?? null;
  }

  if (params.document) {
    const recordExternalId = crmRecordExternalId(params.customerExternalId, params.document.id);
    const { customer_id: _c, external_id: _e, ...recordRow } = documentToRecordRow(
      customerUuid,
      params.document,
      dealUuid,
    );

    const { error: recordError } = await admin.from('customer_records').upsert(
      {
        ...recordRow,
        customer_id: customerUuid,
        external_id: recordExternalId,
        deal_id: dealUuid,
      },
      { onConflict: 'external_id' },
    );
    if (recordError) throw new Error(recordError.message);
  }

  await bumpCustomerCounts(admin, customerUuid);
}

export async function updateCustomerDeal(
  customerExternalId: string,
  contract: CandidContractRecord,
): Promise<void> {
  const customerUuid = await getCrmCustomerUuid(customerExternalId);
  if (!customerUuid) throw new Error(`Customer not found: ${customerExternalId}`);

  const admin = createSupabaseAdminClient();
  const dealRow = contractToDealRow(customerUuid, contract);
  const { error } = await admin.from('deals').upsert(dealRow, { onConflict: 'external_id' });
  if (error) throw new Error(error.message);
}

export async function updateCustomerDocument(
  customerExternalId: string,
  document: CustomerDocument,
): Promise<void> {
  const customerUuid = await getCrmCustomerUuid(customerExternalId);
  if (!customerUuid) throw new Error(`Customer not found: ${customerExternalId}`);

  const admin = createSupabaseAdminClient();
  let dealUuid: string | null = null;
  if (document.contractId) {
    const { data: linkedDeal, error: dealLookupError } = await admin
      .from('deals')
      .select('id')
      .eq('external_id', document.contractId)
      .eq('customer_id', customerUuid)
      .maybeSingle();
    if (dealLookupError) throw new Error(dealLookupError.message);
    dealUuid = linkedDeal?.id ?? null;
  }

  const recordExternalId = crmRecordExternalId(customerExternalId, document.id);
  const { customer_id: _c, external_id: _e, deal_id: _d, ...recordRow } = documentToRecordRow(
    customerUuid,
    document,
    dealUuid,
  );

  const { error } = await admin.from('customer_records').upsert(
    {
      ...recordRow,
      customer_id: customerUuid,
      external_id: recordExternalId,
      deal_id: dealUuid,
    },
    { onConflict: 'external_id' },
  );
  if (error) throw new Error(error.message);

  await bumpCustomerCounts(admin, customerUuid);
}

export async function deleteCustomerDeal(contractExternalId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data: deal, error: lookupError } = await admin
    .from('deals')
    .select('id, customer_id')
    .eq('external_id', contractExternalId)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (!deal) return;

  const { error: recordError } = await admin
    .from('customer_records')
    .delete()
    .eq('deal_id', deal.id);
  if (recordError) throw new Error(recordError.message);

  const { error: dealError } = await admin.from('deals').delete().eq('id', deal.id);
  if (dealError) throw new Error(dealError.message);

  await bumpCustomerCounts(admin, deal.customer_id);
}

export async function deleteCustomerDocument(
  customerExternalId: string,
  documentId: string,
): Promise<void> {
  const customerUuid = await getCrmCustomerUuid(customerExternalId);
  if (!customerUuid) throw new Error(`Customer not found: ${customerExternalId}`);

  const admin = createSupabaseAdminClient();
  const compositeId = crmRecordExternalId(customerExternalId, documentId);

  const { data: rows, error: findError } = await admin
    .from('customer_records')
    .select('id, external_id, document_data')
    .eq('customer_id', customerUuid);
  if (findError) throw new Error(findError.message);

  const idsToDelete = (rows ?? [])
    .filter((row) => {
      const data = row.document_data as { id?: string } | null;
      return (
        row.external_id === compositeId ||
        row.external_id === documentId ||
        data?.id === documentId
      );
    })
    .map((row) => row.id as string);

  if (idsToDelete.length) {
    const { error } = await admin.from('customer_records').delete().in('id', idsToDelete);
    if (error) throw new Error(error.message);
  }

  await bumpCustomerCounts(admin, customerUuid);
}

/** Create or replace a CRM account (customer + contacts + locations). */
export async function createCrmCustomer(customer: Customer): Promise<void> {
  if (!customer.id?.trim() || !customer.company?.trim()) {
    throw new Error('Customer id and company are required');
  }

  const admin = createSupabaseAdminClient();
  const row = customerToRow(customer);
  const { error } = await admin.from('customers').upsert(row, { onConflict: 'external_id' });
  if (error) throw new Error(error.message);

  const customerUuid = await getCrmCustomerUuid(customer.id);
  if (!customerUuid) throw new Error(`Customer create failed: ${customer.id}`);

  for (const location of customer.locations ?? []) {
    const locRow = locationToRow(customerUuid, location);
    const { error: locError } = await admin.from('customer_locations').upsert(locRow, {
      onConflict: 'customer_id,external_id',
    });
    if (locError) throw new Error(locError.message);
  }

  for (const contact of customer.contacts ?? []) {
    const contactRow = contactToRow(customerUuid, contact);
    const { error: contactError } = await admin.from('customer_contacts').upsert(contactRow, {
      onConflict: 'customer_id,external_id',
    });
    if (contactError) throw new Error(contactError.message);
  }
}

export async function upsertCustomerContact(
  customerExternalId: string,
  contact: Contact,
): Promise<void> {
  const customerUuid = await getCrmCustomerUuid(customerExternalId);
  if (!customerUuid) throw new Error(`Customer not found: ${customerExternalId}`);

  const admin = createSupabaseAdminClient();
  const row = contactToRow(customerUuid, contact);

  if (contact.isPrimary) {
    await admin
      .from('customer_contacts')
      .update({ is_primary: false })
      .eq('customer_id', customerUuid)
      .neq('external_id', contact.id);
  }

  const { error } = await admin.from('customer_contacts').upsert(row, {
    onConflict: 'customer_id,external_id',
  });
  if (error) throw new Error(error.message);
}

export async function deleteCustomerContact(
  customerExternalId: string,
  contactId: string,
): Promise<void> {
  const customerUuid = await getCrmCustomerUuid(customerExternalId);
  if (!customerUuid) throw new Error(`Customer not found: ${customerExternalId}`);

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('customer_contacts')
    .delete()
    .eq('customer_id', customerUuid)
    .eq('external_id', contactId);
  if (error) throw new Error(error.message);
}

export async function updateCustomerProfileFields(
  customerExternalId: string,
  patch: Omit<CustomerProfilePersistPatch, 'location'>,
): Promise<void> {
  const customerUuid = await getCrmCustomerUuid(customerExternalId);
  if (!customerUuid) throw new Error(`Customer not found: ${customerExternalId}`);

  const updates: Record<string, string | number | null> = {};
  if (patch.website !== undefined) updates.website = normalizeWebsiteUrlOrNull(patch.website);
  if (patch.altWebsite !== undefined) updates.alt_website = normalizeWebsiteUrlOrNull(patch.altWebsite);
  if (patch.linkedinUrl !== undefined) updates.linkedin_url = patch.linkedinUrl.trim() || null;
  if (patch.mccCode !== undefined) updates.mcc_code = patch.mccCode.trim() || null;
  if (patch.companyLegal !== undefined) updates.company_legal = patch.companyLegal?.trim() || null;
  if (patch.corpType !== undefined) updates.corp_type = patch.corpType?.trim() || null;
  if (patch.company !== undefined) updates.company = patch.company.trim();
  if (patch.industry !== undefined) updates.industry = patch.industry?.trim() || null;
  if (patch.description !== undefined) updates.description = patch.description?.trim() || null;
  if (patch.taxId !== undefined) updates.tax_id = patch.taxId?.trim() || null;
  if (patch.agent !== undefined) updates.agent = patch.agent.trim() || 'Unassigned';
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.notes !== undefined) updates.notes = patch.notes?.trim() || null;
  if (patch.since !== undefined) updates.since_label = patch.since.trim() || null;
  if (patch.savings !== undefined) {
    const n = Number(patch.savings);
    updates.savings = Number.isFinite(n) && n >= 0 ? n : 0;
  }
  if (!Object.keys(updates).length) return;

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('customers').update(updates).eq('id', customerUuid);
  if (error) throw new Error(error.message);
}

export async function upsertCustomerLocation(
  customerExternalId: string,
  location: Location,
): Promise<void> {
  const customerUuid = await getCrmCustomerUuid(customerExternalId);
  if (!customerUuid) throw new Error(`Customer not found: ${customerExternalId}`);

  const admin = createSupabaseAdminClient();
  const row = locationToRow(customerUuid, location);
  const { error } = await admin.from('customer_locations').upsert(row, {
    onConflict: 'customer_id,external_id',
  });
  if (error) throw new Error(error.message);

  if (location.isPrimary) {
    await admin
      .from('customer_locations')
      .update({ is_primary: false })
      .eq('customer_id', customerUuid)
      .neq('external_id', location.id);
    await admin
      .from('customer_locations')
      .update({ is_primary: true })
      .eq('customer_id', customerUuid)
      .eq('external_id', location.id);
  }
}

export async function updateCustomerProfile(
  customerExternalId: string,
  patch: CustomerProfilePersistPatch,
): Promise<void> {
  const { location, ...fields } = patch;
  await updateCustomerProfileFields(customerExternalId, fields);
  if (location) {
    await upsertCustomerLocation(customerExternalId, location);
  }
}

export async function archiveCustomer(customerExternalId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('customers')
    .update({ archived_at: new Date().toISOString() })
    .eq('external_id', customerExternalId);
  if (error) throw new Error(error.message);
}

export async function restoreCustomer(customerExternalId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('customers')
    .update({ archived_at: null })
    .eq('external_id', customerExternalId);
  if (error) throw new Error(error.message);
}

async function bumpCustomerCounts(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  customerUuid: string,
): Promise<void> {
  const [{ count: dealCount }, { count: recordCount }] = await Promise.all([
    admin.from('deals').select('id', { count: 'exact', head: true }).eq('customer_id', customerUuid),
    admin
      .from('customer_records')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerUuid),
  ]);

  await admin
    .from('customers')
    .update({
      contracts_count: dealCount ?? 0,
      files_count: recordCount ?? 0,
    })
    .eq('id', customerUuid);
}
