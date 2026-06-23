import type { Location, Contact } from '@/components/CustomersView';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { CandidContractRecord, CustomerDocument } from '@/lib/customer-records';
import {
  contactToRow,
  contractToDealRow,
  crmRecordExternalId,
  documentToRecordRow,
  locationToRow,
} from '@/lib/crm/db-mapper';
import { getCrmCustomerUuid } from '@/lib/crm/load-from-db';

export type CustomerProfilePersistPatch = {
  website?: string;
  mccCode?: string;
  location?: Location;
};

export async function persistCustomerRecord(params: {
  customerExternalId: string;
  document: CustomerDocument;
  contract?: CandidContractRecord;
}): Promise<void> {
  const customerUuid = await getCrmCustomerUuid(params.customerExternalId);
  if (!customerUuid) {
    throw new Error(`Customer not found: ${params.customerExternalId}`);
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
  }

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
    },
    { onConflict: 'external_id' },
  );
  if (recordError) throw new Error(recordError.message);

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
  const recordExternalId = crmRecordExternalId(customerExternalId, document.id);
  const { customer_id: _c, external_id: _e, deal_id: _d, ...recordRow } = documentToRecordRow(
    customerUuid,
    document,
  );

  const { error } = await admin.from('customer_records').upsert(
    {
      ...recordRow,
      customer_id: customerUuid,
      external_id: recordExternalId,
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
  patch: Pick<CustomerProfilePersistPatch, 'website' | 'mccCode'>,
): Promise<void> {
  const customerUuid = await getCrmCustomerUuid(customerExternalId);
  if (!customerUuid) throw new Error(`Customer not found: ${customerExternalId}`);

  const updates: Record<string, string | null> = {};
  if (patch.website !== undefined) updates.website = patch.website.trim() || null;
  if (patch.mccCode !== undefined) updates.mcc_code = patch.mccCode.trim() || null;
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
  await updateCustomerProfileFields(customerExternalId, patch);
  if (patch.location) {
    await upsertCustomerLocation(customerExternalId, patch.location);
  }
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
