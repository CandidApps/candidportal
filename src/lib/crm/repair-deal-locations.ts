import type { SupabaseClient } from '@supabase/supabase-js';
import {
  extractLocationIdFromContractData,
  patchContractDataForLocation,
  patchDocumentDataForLocation,
} from '@/lib/crm/deal-location-link';

async function customerUuidByExternalId(
  admin: SupabaseClient,
  externalId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from('customers')
    .select('id')
    .eq('external_id', externalId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.id as string | undefined) ?? null;
}

/**
 * Re-link deals/documents missing location_external_id after account merges.
 * Uses merged location prefixes (sourceAccountId::…) and legacy customerId in jsonb.
 */
export async function repairCustomerDealLocationLinks(
  admin: SupabaseClient,
  customerExternalId: string,
): Promise<{ dealsRepaired: number; recordsRepaired: number }> {
  const customerId = customerExternalId.trim();
  const customerUuid = await customerUuidByExternalId(admin, customerId);
  if (!customerUuid) throw new Error('Account not found');

  const { data: locations } = await admin
    .from('customer_locations')
    .select('external_id')
    .eq('customer_id', customerUuid);

  const locationIds = new Set((locations ?? []).map((l) => l.external_id as string));
  const locationByMergedSource = new Map<string, string>();
  for (const loc of locations ?? []) {
    const ext = loc.external_id as string;
    const sep = ext.indexOf('::');
    if (sep > 0) {
      locationByMergedSource.set(ext.slice(0, sep), ext);
    }
  }

  const resolveLoc = (
    rowLoc: string | null,
    jsonData: Record<string, unknown>,
  ): string | null => {
    if (rowLoc?.trim() && locationIds.has(rowLoc.trim())) return rowLoc.trim();
    const fromJson = extractLocationIdFromContractData(jsonData);
    if (fromJson && locationIds.has(fromJson)) return fromJson;
    const legacyCustomerId =
      typeof jsonData.customerId === 'string' ? jsonData.customerId.trim() : '';
    if (legacyCustomerId && locationByMergedSource.has(legacyCustomerId)) {
      return locationByMergedSource.get(legacyCustomerId)!;
    }
    return null;
  };

  let dealsRepaired = 0;
  const { data: deals } = await admin
    .from('deals')
    .select('id, location_external_id, contract_data')
    .eq('customer_id', customerUuid);

  for (const deal of deals ?? []) {
    const rowLoc = (deal.location_external_id as string | null) ?? null;
    if (rowLoc?.trim() && locationIds.has(rowLoc.trim())) continue;
    const contractData = (deal.contract_data as Record<string, unknown>) ?? {};
    const mapped = resolveLoc(rowLoc, contractData);
    if (!mapped) continue;

    const { error } = await admin
      .from('deals')
      .update({
        location_external_id: mapped,
        contract_data: patchContractDataForLocation(contractData, mapped, customerId),
      })
      .eq('id', deal.id);
    if (error) throw new Error(error.message);
    dealsRepaired += 1;
  }

  let recordsRepaired = 0;
  const { data: records } = await admin
    .from('customer_records')
    .select('id, location_external_id, document_data')
    .eq('customer_id', customerUuid);

  for (const rec of records ?? []) {
    const rowLoc = (rec.location_external_id as string | null) ?? null;
    if (rowLoc?.trim() && locationIds.has(rowLoc.trim())) continue;
    const docData = (rec.document_data as Record<string, unknown>) ?? {};
    const mapped = resolveLoc(rowLoc, docData);
    if (!mapped) continue;

    const { error } = await admin
      .from('customer_records')
      .update({
        location_external_id: mapped,
        document_data: patchDocumentDataForLocation(docData, mapped, customerId),
      })
      .eq('id', rec.id);
    if (error) throw new Error(error.message);
    recordsRepaired += 1;
  }

  return { dealsRepaired, recordsRepaired };
}
