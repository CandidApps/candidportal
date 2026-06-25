import { isLocalPersistence } from '@/lib/persistence/config';
import {
  insertLocalAccountService,
  newLocalId,
  updateLocalAccountService,
} from '@/lib/persistence/local-data-store';
import type { ExternalServiceDraft } from '@/lib/external-service-extract';
import {
  computeExternalServiceStatus,
  parseMonthlyCents,
  parseUserCount,
} from '@/lib/external-service-extract';
import {
  logoKeyFromLabel,
  type AccountServiceRow,
  type AccountServiceStatus,
} from '@/lib/services/account-services';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { serviceBillStoragePath, serviceContractStoragePath } from '@/lib/storage-paths';

export type ExternalServiceDocumentKind = 'contract' | 'bill';

export type SaveExternalServiceInput = {
  userId: string;
  draft: ExternalServiceDraft;
  serviceId?: string;
  contractFile?: File | null;
  billFile?: File | null;
  crmCustomerId?: string | null;
};

function buildRowFields(draft: ExternalServiceDraft): Pick<
  AccountServiceRow,
  | 'name'
  | 'vendor'
  | 'status'
  | 'monthly_amount_cents'
  | 'expires_at'
  | 'logo_key'
  | 'service_description'
  | 'user_count'
  | 'renewal_terms'
  | 'interested_in_alternatives'
  | 'contract_start_date'
> {
  const supplier = draft.supplierName.trim();
  const serviceName = draft.serviceName.trim() || supplier || 'External service';
  const expiresAt = draft.contractEndDate.trim() || null;
  const status: AccountServiceStatus = computeExternalServiceStatus(expiresAt);
  return {
    name: serviceName,
    vendor: supplier || null,
    status,
    monthly_amount_cents: parseMonthlyCents(draft.monthlyAmount),
    expires_at: expiresAt,
    logo_key: logoKeyFromLabel(`${supplier} ${serviceName}`),
    service_description: draft.serviceDescription.trim() || null,
    user_count: parseUserCount(draft.userCount),
    renewal_terms: draft.renewalTerms.trim() || null,
    interested_in_alternatives: draft.interestedInAlternatives,
    contract_start_date: draft.contractStartDate.trim() || null,
  };
}

function emptyExternalDefaults(userId: string, id: string): AccountServiceRow {
  const now = new Date().toISOString();
  return {
    id,
    user_id: userId,
    name: 'External service',
    vendor: null,
    status: 'external',
    monthly_amount_cents: null,
    expires_at: null,
    logo_key: 'external',
    bill_storage_path: null,
    service_type: null,
    merchant_analysis: null,
    analysis_snapshot: null,
    analysis_review_id: null,
    candid_managed: false,
    savings_opportunity_only: false,
    service_description: null,
    user_count: null,
    renewal_terms: null,
    interested_in_alternatives: false,
    contract_start_date: null,
    contract_storage_path: null,
    contract_filename: null,
    created_at: now,
    updated_at: now,
  };
}

async function uploadDocument(
  userId: string,
  serviceId: string,
  file: File,
  kind: ExternalServiceDocumentKind,
): Promise<{ path: string; filename: string }> {
  if (isLocalPersistence()) {
    return {
      path: `local://${serviceId}/${kind}/${file.name}`,
      filename: file.name,
    };
  }

  const supabase = createSupabaseBrowserClient();
  const path =
    kind === 'contract'
      ? serviceContractStoragePath(userId, serviceId, file.name)
      : serviceBillStoragePath(userId, serviceId, file.name);
  const { error } = await supabase.storage.from('service-bills').upload(path, file, { upsert: true });
  if (error) throw error;
  return { path, filename: file.name };
}

export async function saveExternalMemberService(input: SaveExternalServiceInput): Promise<string> {
  const { userId, draft, serviceId, contractFile, billFile, crmCustomerId } = input;
  const fields = buildRowFields(draft);
  const now = new Date().toISOString();

  if (isLocalPersistence()) {
    const id = serviceId ?? newLocalId();

    let contract_storage_path: string | null = null;
    let contract_filename: string | null = null;
    let bill_storage_path: string | null = null;

    if (contractFile) {
      const uploaded = await uploadDocument(userId, id, contractFile, 'contract');
      contract_storage_path = uploaded.path;
      contract_filename = uploaded.filename;
    }
    if (billFile) {
      const uploaded = await uploadDocument(userId, id, billFile, 'bill');
      bill_storage_path = uploaded.path;
    }

    if (serviceId) {
      updateLocalAccountService(serviceId, {
        ...fields,
        ...(contract_storage_path ? { contract_storage_path, contract_filename } : {}),
        ...(bill_storage_path ? { bill_storage_path } : {}),
        candid_managed: false,
        savings_opportunity_only: false,
        ...(crmCustomerId ? { crm_customer_id: crmCustomerId } : {}),
      });
      return serviceId;
    }

    const row: AccountServiceRow = {
      ...emptyExternalDefaults(userId, id),
      ...fields,
      contract_storage_path,
      contract_filename,
      bill_storage_path,
      ...(crmCustomerId ? { crm_customer_id: crmCustomerId } : {}),
    };
    insertLocalAccountService(row);
    return id;
  }

  const supabase = createSupabaseBrowserClient();
  let id = serviceId;

  if (!id) {
    const { data, error } = await supabase
      .from('account_services')
      .insert({
        user_id: userId,
        ...fields,
        candid_managed: false,
        savings_opportunity_only: false,
        ...(crmCustomerId ? { crm_customer_id: crmCustomerId } : {}),
      })
      .select('id')
      .single();
    if (error || !data) throw error ?? new Error('Insert failed');
    id = data.id as string;
  } else {
    const { error } = await supabase
      .from('account_services')
      .update({
        ...fields,
        updated_at: now,
        ...(crmCustomerId ? { crm_customer_id: crmCustomerId } : {}),
      })
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  }

  const patch: Record<string, string | null> = {};

  if (contractFile) {
    const uploaded = await uploadDocument(userId, id, contractFile, 'contract');
    patch.contract_storage_path = uploaded.path;
    patch.contract_filename = uploaded.filename;
  }
  if (billFile) {
    const uploaded = await uploadDocument(userId, id, billFile, 'bill');
    patch.bill_storage_path = uploaded.path;
  }

  if (Object.keys(patch).length) {
    const { error } = await supabase.from('account_services').update(patch).eq('id', id);
    if (error) throw error;
  }

  return id;
}

export async function signedServiceDocumentUrl(
  storagePath: string | null | undefined,
): Promise<string | null> {
  if (!storagePath || storagePath.startsWith('local://')) return null;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.storage
    .from('service-bills')
    .createSignedUrl(storagePath, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
