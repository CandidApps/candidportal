import type { SupabaseClient } from '@supabase/supabase-js';
import {
  extractLocationIdFromContractData,
  patchContractDataForLocation,
  patchDocumentDataForLocation,
  resolveMergedLocationExternalId,
} from '@/lib/crm/deal-location-link';

export type MergeCustomerOptions = {
  /** Create one location on the target named after the merged account (vs moving each source location). */
  addAsSingleLocation?: boolean;
  /** Label for the new location when addAsSingleLocation is true. */
  mergedLocationLabel?: string;
  /** Link all merged deals/documents to the merged-account location. */
  linkDealsToLocation?: boolean;
};

export type MergeCustomerResult = {
  targetExternalId: string;
  sourceExternalId: string;
  locationsMoved: number;
  contactsMoved: number;
  dealsMoved: number;
  recordsMoved: number;
  mergedLocationExternalId?: string | null;
};

function resolveUniqueExternalId(externalId: string, used: Set<string>, prefix: string): string {
  if (!used.has(externalId)) {
    used.add(externalId);
    return externalId;
  }
  const prefixed = `${prefix}::${externalId}`;
  if (!used.has(prefixed)) {
    used.add(prefixed);
    return prefixed;
  }
  let i = 2;
  while (used.has(`${prefixed}::${i}`)) i += 1;
  const final = `${prefixed}::${i}`;
  used.add(final);
  return final;
}

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

/** Move one CRM account into another (locations become sub-locations); source is archived. */
export async function mergeCustomerAccounts(
  admin: SupabaseClient,
  sourceExternalId: string,
  targetExternalId: string,
  options?: MergeCustomerOptions,
): Promise<MergeCustomerResult> {
  const sourceId = sourceExternalId.trim();
  const targetId = targetExternalId.trim();
  if (!sourceId || !targetId) throw new Error('Source and target account ids are required');
  if (sourceId === targetId) throw new Error('Cannot merge an account into itself');

  const sourceUuid = await customerUuidByExternalId(admin, sourceId);
  const targetUuid = await customerUuidByExternalId(admin, targetId);
  if (!sourceUuid) throw new Error('Source account not found');
  if (!targetUuid) throw new Error('Target account not found');

  const [{ data: sourceRow }, { data: targetRow }] = await Promise.all([
    admin.from('customers').select('id, external_id, company, notes, savings, spend').eq('id', sourceUuid).single(),
    admin.from('customers').select('id, external_id, company, notes, savings, spend').eq('id', targetUuid).single(),
  ]);
  if (!sourceRow || !targetRow) throw new Error('Could not load account rows');

  const sourceCompany = String(sourceRow.company ?? sourceId);

  const { data: targetLocations } = await admin
    .from('customer_locations')
    .select('id, external_id')
    .eq('customer_id', targetUuid);
  const usedLocationIds = new Set((targetLocations ?? []).map((r) => r.external_id as string));

  const { data: targetContacts } = await admin
    .from('customer_contacts')
    .select('id, external_id, is_primary')
    .eq('customer_id', targetUuid);
  const usedContactIds = new Set((targetContacts ?? []).map((r) => r.external_id as string));
  const targetHasPrimaryContact = (targetContacts ?? []).some((r) => Boolean(r.is_primary));

  const { data: targetRecords } = await admin
    .from('customer_records')
    .select('external_id')
    .eq('customer_id', targetUuid);
  const usedRecordIds = new Set((targetRecords ?? []).map((r) => r.external_id as string));

  const { data: sourceLocations } = await admin
    .from('customer_locations')
    .select('id, external_id, label, is_primary, street, city, state, zip')
    .eq('customer_id', sourceUuid);

  const locationIdMap = new Map<string, string>();
  let locationsMoved = 0;
  let mergedLocationExternalId: string | null = null;

  const addAsSingleLocation = Boolean(options?.addAsSingleLocation);
  const linkDealsToLocation = Boolean(options?.linkDealsToLocation);

  if (addAsSingleLocation) {
    const primary =
      (sourceLocations ?? []).find((r) => Boolean(r.is_primary)) ?? sourceLocations?.[0];
    const label = options?.mergedLocationLabel?.trim() || sourceCompany;
    const newExt = resolveUniqueExternalId(`${sourceId}::account`, usedLocationIds, sourceId);
    mergedLocationExternalId = newExt;

    for (const row of sourceLocations ?? []) {
      locationIdMap.set(row.external_id as string, newExt);
    }

    const { error } = await admin.from('customer_locations').insert({
      customer_id: targetUuid,
      external_id: newExt,
      label,
      street: String(primary?.street ?? ''),
      city: String(primary?.city ?? ''),
      state: String(primary?.state ?? ''),
      zip: String(primary?.zip ?? ''),
      is_primary: false,
    });
    if (error) throw new Error(error.message);
    locationsMoved = 1;
  } else {
    for (const row of sourceLocations ?? []) {
      const oldExt = row.external_id as string;
      const newExt = resolveUniqueExternalId(oldExt, usedLocationIds, sourceId);
      locationIdMap.set(oldExt, newExt);

      let label = String(row.label ?? 'Location');
      if (label === 'Primary' || label.toLowerCase() === 'primary') {
        label = `${sourceCompany}`;
      } else if (!label.toLowerCase().includes(sourceCompany.toLowerCase().slice(0, 8))) {
        label = `${sourceCompany} — ${label}`;
      }

      const { error } = await admin
        .from('customer_locations')
        .update({
          customer_id: targetUuid,
          external_id: newExt,
          label,
          is_primary: false,
        })
        .eq('id', row.id);
      if (error) throw new Error(error.message);
      locationsMoved += 1;
    }
  }

  const { data: sourceContacts } = await admin
    .from('customer_contacts')
    .select('id, external_id, location_ids, is_primary')
    .eq('customer_id', sourceUuid);

  let contactsMoved = 0;
  for (const row of sourceContacts ?? []) {
    const oldExt = row.external_id as string;
    const newExt = resolveUniqueExternalId(oldExt, usedContactIds, sourceId);
    const oldLocIds = (row.location_ids as string[] | null) ?? [];
    const newLocIds = oldLocIds.map((lid) => locationIdMap.get(lid) ?? lid);

    const { error } = await admin
      .from('customer_contacts')
      .update({
        customer_id: targetUuid,
        external_id: newExt,
        location_ids: newLocIds,
        is_primary: targetHasPrimaryContact ? false : row.is_primary,
      })
      .eq('id', row.id);
    if (error) throw new Error(error.message);
    contactsMoved += 1;
  }

  const sourcePrimaryRow =
    (sourceLocations ?? []).find((r) => Boolean(r.is_primary)) ?? sourceLocations?.[0];
  const defaultMappedLoc =
    linkDealsToLocation && mergedLocationExternalId
      ? mergedLocationExternalId
      : sourcePrimaryRow
        ? locationIdMap.get(sourcePrimaryRow.external_id as string)
        : mergedLocationExternalId ?? undefined;

  const { data: sourceDeals } = await admin
    .from('deals')
    .select('id, location_external_id, contract_data')
    .eq('customer_id', sourceUuid);

  const forceLinkedLocation =
    linkDealsToLocation ? mergedLocationExternalId ?? defaultMappedLoc ?? null : null;

  let dealsMoved = 0;
  for (const deal of sourceDeals ?? []) {
    const contractData = (deal.contract_data as Record<string, unknown>) ?? {};
    const rawLoc =
      (deal.location_external_id as string | null) ??
      extractLocationIdFromContractData(contractData);
    const mappedLoc = forceLinkedLocation
      ? forceLinkedLocation
      : resolveMergedLocationExternalId(rawLoc, locationIdMap, defaultMappedLoc);
    const newContractData = patchContractDataForLocation(contractData, mappedLoc, targetId);

    const { error } = await admin
      .from('deals')
      .update({
        customer_id: targetUuid,
        location_external_id: mappedLoc,
        contract_data: newContractData,
      })
      .eq('id', deal.id);
    if (error) throw new Error(error.message);
    dealsMoved += 1;
  }

  const { data: sourceRecords } = await admin
    .from('customer_records')
    .select('id, external_id, location_external_id, document_data')
    .eq('customer_id', sourceUuid);

  let recordsMoved = 0;
  for (const rec of sourceRecords ?? []) {
    const oldExt = rec.external_id as string;
    const newExt = resolveUniqueExternalId(oldExt, usedRecordIds, sourceId);
    const docData = (rec.document_data as Record<string, unknown>) ?? {};
    const rawLoc =
      (rec.location_external_id as string | null) ??
      (typeof docData.locationId === 'string' ? docData.locationId : null);
    const mappedLoc = forceLinkedLocation
      ? forceLinkedLocation
      : resolveMergedLocationExternalId(rawLoc, locationIdMap, defaultMappedLoc);

    const { error } = await admin
      .from('customer_records')
      .update({
        customer_id: targetUuid,
        external_id: newExt,
        location_external_id: mappedLoc,
        document_data: patchDocumentDataForLocation(docData, mappedLoc, targetId),
      })
      .eq('id', rec.id);
    if (error) throw new Error(error.message);
    recordsMoved += 1;
  }

  // Text-keyed CRM references
  const textRefUpdates: Array<{ table: string; column: string }> = [
    { table: 'member_review_requests', column: 'crm_customer_id' },
    { table: 'account_services', column: 'crm_customer_id' },
    { table: 'bill_analysis_reviews', column: 'crm_customer_id' },
    { table: 'customer_quotes', column: 'customer_id' },
    { table: 'admin_expenses', column: 'customer_id' },
    { table: 'contract_submit_actions', column: 'crm_customer_external_id' },
    { table: 'deal_activity_events', column: 'crm_customer_external_id' },
  ];

  for (const { table, column } of textRefUpdates) {
    const { error } = await admin.from(table).update({ [column]: targetId }).eq(column, sourceId);
    if (error && !/does not exist|column/.test(error.message)) {
      console.warn(`[merge-customers] skip ${table}.${column}:`, error.message);
    }
  }

  // Outreach: unique per owner + customer — drop source rows that would collide
  const { data: sourceOutreach } = await admin
    .from('admin_outreach_accounts')
    .select('id, owner_user_id')
    .eq('customer_external_id', sourceId);
  for (const row of sourceOutreach ?? []) {
    const ownerId = row.owner_user_id as string;
    const { data: clash } = await admin
      .from('admin_outreach_accounts')
      .select('id')
      .eq('owner_user_id', ownerId)
      .eq('customer_external_id', targetId)
      .maybeSingle();
    if (clash?.id) {
      await admin.from('admin_outreach_accounts').delete().eq('id', row.id);
    } else {
      await admin
        .from('admin_outreach_accounts')
        .update({ customer_external_id: targetId })
        .eq('id', row.id);
    }
  }

  // Sentiment: one row per customer_id
  const { data: targetSentiment } = await admin
    .from('customer_sentiment')
    .select('customer_id')
    .eq('customer_id', targetId)
    .maybeSingle();
  if (targetSentiment) {
    await admin.from('customer_sentiment').delete().eq('customer_id', sourceId);
  } else {
    await admin
      .from('customer_sentiment')
      .update({ customer_id: targetId })
      .eq('customer_id', sourceId);
  }

  await admin
    .from('dialpad_calls')
    .update({ crm_customer_id: targetUuid })
    .eq('crm_customer_id', sourceUuid);

  await admin
    .from('portal_leads')
    .update({ converted_customer_id: targetUuid })
    .eq('converted_customer_id', sourceUuid);

  const mergeStamp = new Date().toISOString().slice(0, 10);
  const mergeNote = `[Merged account ${sourceCompany} (${sourceId}) on ${mergeStamp}]`;
  const mergedNotes = [targetRow.notes, sourceRow.notes, mergeNote].filter(Boolean).join('\n\n');

  await admin
    .from('customers')
    .update({
      notes: mergedNotes,
      savings: Number(targetRow.savings ?? 0) + Number(sourceRow.savings ?? 0),
      spend: Number(targetRow.spend ?? 0) + Number(sourceRow.spend ?? 0),
    })
    .eq('id', targetUuid);

  await admin
    .from('customers')
    .update({
      archived_at: new Date().toISOString(),
      contracts_count: 0,
      files_count: 0,
      notes: [sourceRow.notes, `[Merged into ${targetRow.company} (${targetId}) on ${mergeStamp}]`]
        .filter(Boolean)
        .join('\n\n'),
    })
    .eq('id', sourceUuid);

  const [{ count: dealCount }, { count: recordCount }] = await Promise.all([
    admin.from('deals').select('id', { count: 'exact', head: true }).eq('customer_id', targetUuid),
    admin
      .from('customer_records')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', targetUuid),
  ]);

  await admin
    .from('customers')
    .update({
      contracts_count: dealCount ?? 0,
      files_count: recordCount ?? 0,
    })
    .eq('id', targetUuid);

  return {
    targetExternalId: targetId,
    sourceExternalId: sourceId,
    locationsMoved,
    contactsMoved,
    dealsMoved,
    recordsMoved,
    mergedLocationExternalId,
  };
}
