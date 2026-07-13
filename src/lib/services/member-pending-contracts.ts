import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  mapContractSubmitActionRow,
  type ContractSubmitActionRow,
} from '@/lib/services/contract-submit-actions';
import type { MemberPortalCustomerContext } from '@/lib/portal/member-customer-resolve';

export type MemberPendingContract = {
  id: string;
  serviceLabel: string;
  vendorName: string | null;
  accountName: string;
  contractUrl: string | null;
  contractFilename: string | null;
  hasStoredFile: boolean;
  /** Portal path that redirects to signed file or external URL. */
  openPath: string | null;
  monthlyTotal: number | null;
  updatedAt: string;
};

function normalizeExternalUrl(raw: string | null | undefined): string | null {
  const url = raw?.trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[\w.-]+\.[\w.-]+/.test(url)) return `https://${url}`;
  return url;
}

export function toMemberPendingContract(row: ContractSubmitActionRow): MemberPendingContract {
  const hasStoredFile = Boolean(row.contract_storage_path?.trim());
  const contractUrl = normalizeExternalUrl(row.contract_url);
  return {
    id: row.id,
    serviceLabel: row.service_label,
    vendorName: row.vendor_name,
    accountName:
      row.account_name?.trim() ||
      row.customer_name?.trim() ||
      row.acceptance?.contactName?.trim() ||
      'Your account',
    contractUrl,
    contractFilename: row.contract_filename,
    hasStoredFile,
    openPath: hasStoredFile || contractUrl ? `/api/portal/contracts/${row.id}/file` : null,
    monthlyTotal: row.acceptance?.monthlyTotal ?? null,
    updatedAt: row.updated_at || row.created_at,
  };
}

/** Pending signature contracts for a portal customer (admin-sent, awaiting customer). */
export async function listPendingContractsForCustomer(
  ctx: MemberPortalCustomerContext,
): Promise<MemberPendingContract[]> {
  const admin = createSupabaseAdminClient();
  const externalId = ctx.customerExternalId.trim();
  const email = ctx.contactEmail.trim().toLowerCase();

  const filters: string[] = [];
  if (externalId) filters.push(`crm_customer_external_id.eq.${externalId}`);
  if (email) filters.push(`customer_email.ilike.${email}`);

  let query = admin
    .from('contract_submit_actions')
    .select('*')
    .eq('status', 'customer_contract_sent')
    .order('updated_at', { ascending: false })
    .limit(50);

  if (filters.length === 1) {
    if (externalId) query = query.eq('crm_customer_external_id', externalId);
    else query = query.ilike('customer_email', email);
  } else if (filters.length > 1) {
    query = query.or(filters.join(','));
  } else {
    return [];
  }

  const { data, error } = await query;
  if (error) {
    if (/contract_submit_actions/.test(error.message)) return [];
    console.error('listPendingContractsForCustomer', error.message);
    return [];
  }

  return (data ?? [])
    .map((r) => mapContractSubmitActionRow(r as Record<string, unknown>))
    .map(toMemberPendingContract);
}

export async function loadPendingContractForCustomer(
  id: string,
  ctx: MemberPortalCustomerContext,
): Promise<ContractSubmitActionRow | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('contract_submit_actions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const row = mapContractSubmitActionRow(data as Record<string, unknown>);
  const externalId = ctx.customerExternalId.trim();
  const email = ctx.contactEmail.trim().toLowerCase();
  const allowed =
    row.crm_customer_external_id?.trim() === externalId ||
    (email && row.customer_email?.trim().toLowerCase() === email);
  return allowed ? row : null;
}
