import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { buildActionKey } from '@/lib/admin-action-work';
import type { QuoteCustomerAcceptance } from '@/lib/quotes/quote-acceptance';
import { formatCustomerTicketTime } from '@/lib/services/customer-tickets';

export const CONTRACT_DEAL_STAGES = [
  'quote_accepted',
  'supplier_contract_requested',
  'supplier_contract_received',
  'customer_contract_sent',
  'customer_contract_signed',
  'converted',
] as const;

export type ContractDealStage = (typeof CONTRACT_DEAL_STAGES)[number];

/** @deprecated use ContractDealStage */
export type ContractSubmitActionStatus = ContractDealStage | 'open' | 'in_progress' | 'resolved';

export const CONTRACT_DEAL_STAGE_LABEL: Record<ContractDealStage, string> = {
  quote_accepted: 'Quote accepted',
  supplier_contract_requested: 'Supplier contract requested',
  supplier_contract_received: 'Supplier contract received',
  customer_contract_sent: 'Customer contract sent',
  customer_contract_signed: 'Customer contract signed',
  converted: 'Converted — active service',
};

/** Compact strip labels — always readable in the step UI. */
export const CONTRACT_DEAL_STAGE_SHORT: Record<ContractDealStage, string> = {
  quote_accepted: 'Quote accepted',
  supplier_contract_requested: 'To supplier',
  supplier_contract_received: 'From supplier',
  customer_contract_sent: 'To customer',
  customer_contract_signed: 'Signed',
  converted: 'Converted',
};

export function normalizeContractDealStage(raw: string | null | undefined): ContractDealStage {
  const s = String(raw ?? '').trim();
  if ((CONTRACT_DEAL_STAGES as readonly string[]).includes(s)) return s as ContractDealStage;
  if (s === 'open' || s === 'in_progress') return 'quote_accepted';
  if (s === 'resolved') return 'customer_contract_signed';
  return 'quote_accepted';
}

export type ContractSubmitActionRow = {
  id: string;
  user_id: string;
  analysis_review_id: string | null;
  quote_request_id: string | null;
  account_service_id: string | null;
  service_label: string;
  /** Business / CRM account name (preferred for list headers). */
  account_name: string | null;
  /** Contact person name. */
  customer_name: string | null;
  customer_email: string | null;
  details: string | null;
  acceptance: QuoteCustomerAcceptance | null;
  status: ContractDealStage;
  vendor_name: string | null;
  provider_id: string | null;
  pay_source: string | null;
  paysource_partner_id: string | null;
  supplier_contact_email: string | null;
  contract_url: string | null;
  contract_filename: string | null;
  /** Supabase Storage path when an attachment was imported into candid_documents. */
  contract_storage_path: string | null;
  lead_id: string | null;
  crm_customer_external_id: string | null;
  customer_submit_action_id: string | null;
  created_at: string;
  updated_at: string;
};

export function mapContractSubmitActionRow(row: Record<string, unknown>): ContractSubmitActionRow {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    analysis_review_id: row.analysis_review_id ? String(row.analysis_review_id) : null,
    quote_request_id: row.quote_request_id ? String(row.quote_request_id) : null,
    account_service_id: row.account_service_id ? String(row.account_service_id) : null,
    service_label: String(row.service_label ?? 'Quote'),
    account_name: (row.account_name as string | null) ?? null,
    customer_name: (row.customer_name as string | null) ?? null,
    customer_email: (row.customer_email as string | null) ?? null,
    details: (row.details as string | null) ?? null,
    acceptance: (row.acceptance as QuoteCustomerAcceptance | null) ?? null,
    status: normalizeContractDealStage(row.status as string),
    vendor_name: (row.vendor_name as string | null) ?? null,
    provider_id: row.provider_id ? String(row.provider_id) : null,
    pay_source: (row.pay_source as string | null) ?? null,
    paysource_partner_id: row.paysource_partner_id ? String(row.paysource_partner_id) : null,
    supplier_contact_email: (row.supplier_contact_email as string | null) ?? null,
    contract_url: (row.contract_url as string | null) ?? null,
    contract_filename: (row.contract_filename as string | null) ?? null,
    contract_storage_path: (row.contract_storage_path as string | null) ?? null,
    lead_id: row.lead_id ? String(row.lead_id) : null,
    crm_customer_external_id: (row.crm_customer_external_id as string | null) ?? null,
    customer_submit_action_id: row.customer_submit_action_id
      ? String(row.customer_submit_action_id)
      : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at ?? row.created_at),
  };
}

export function formatContractSubmitTime(iso: string): string {
  return formatCustomerTicketTime(iso);
}

/** Account/business label for tickets and workbench; falls back to contact name. */
export function dealAccountDisplayName(action: ContractSubmitActionRow): string {
  return (
    action.account_name?.trim() ||
    action.acceptance?.contactName?.trim() ||
    action.customer_name?.trim() ||
    'Customer'
  );
}

/** Contact person when it differs from the account name. */
export function dealContactDisplayName(action: ContractSubmitActionRow): string | null {
  const account = action.account_name?.trim() || '';
  const contact =
    action.customer_name?.trim() ||
    action.acceptance?.contactName?.trim() ||
    '';
  if (!contact) return null;
  if (account && contact.toLowerCase() === account.toLowerCase()) return null;
  return contact;
}

export function isSupplierSubmitStage(stage: ContractDealStage): boolean {
  return stage === 'quote_accepted' || stage === 'supplier_contract_requested';
}

export function isCustomerSubmitStage(stage: ContractDealStage): boolean {
  return (
    stage === 'supplier_contract_received' ||
    stage === 'customer_contract_sent' ||
    stage === 'customer_contract_signed'
  );
}

export function ticketStatusForDealStage(
  stage: ContractDealStage,
): 'open' | 'in_progress' | 'resolved' {
  if (stage === 'converted') return 'resolved';
  if (
    stage === 'supplier_contract_requested' ||
    stage === 'customer_contract_sent' ||
    stage === 'customer_contract_signed'
  ) {
    return 'in_progress';
  }
  return 'open';
}

/** Claimers on the parent analysis/quote action, else assignees, else the publisher. */
export async function resolveContractSubmitAssigneeIds(params: {
  analysisReviewId?: string | null;
  quoteRequestId?: string | null;
  publishedBy?: string | null;
}): Promise<{ userIds: string[]; autoClaim: boolean }> {
  const admin = createSupabaseAdminClient();
  const parentKind = params.analysisReviewId ? 'analysis_review' : 'quote_request';
  const parentId = params.analysisReviewId ?? params.quoteRequestId;
  if (!parentId) {
    return params.publishedBy
      ? { userIds: [params.publishedBy], autoClaim: true }
      : { userIds: [], autoClaim: false };
  }

  const parentKey = buildActionKey(parentKind, parentId);
  const { data: assignees } = await admin
    .from('admin_action_assignees')
    .select('user_id, claimed_at')
    .eq('action_key', parentKey);

  const rows = assignees ?? [];
  const claimers = rows.filter((r) => r.claimed_at).map((r) => String(r.user_id));
  if (claimers.length) return { userIds: [...new Set(claimers)], autoClaim: true };

  const assigned = rows.map((r) => String(r.user_id));
  if (assigned.length) return { userIds: [...new Set(assigned)], autoClaim: false };

  if (params.publishedBy) return { userIds: [params.publishedBy], autoClaim: true };
  return { userIds: [], autoClaim: false };
}

export async function assignContractSubmitAction(params: {
  actionId: string;
  userIds: string[];
  autoClaim: boolean;
  actionKind?: 'submit_contract' | 'submit_contract_to_customer';
}): Promise<void> {
  if (!params.userIds.length) return;
  const admin = createSupabaseAdminClient();
  const kind = params.actionKind ?? 'submit_contract';
  const actionKey = buildActionKey(kind, params.actionId);
  const now = new Date().toISOString();

  await admin.from('admin_action_work').upsert(
    {
      action_key: actionKey,
      action_kind: kind,
      source_id: params.actionId,
      updated_at: now,
    },
    { onConflict: 'action_key' },
  );

  for (const userId of params.userIds) {
    const { data: existing } = await admin
      .from('admin_action_assignees')
      .select('user_id')
      .eq('action_key', actionKey)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      if (params.autoClaim) {
        await admin
          .from('admin_action_assignees')
          .update({ claimed_at: now })
          .eq('action_key', actionKey)
          .eq('user_id', userId);
      }
      continue;
    }

    await admin.from('admin_action_assignees').insert({
      action_key: actionKey,
      user_id: userId,
      assigned_by: userId,
      assigned_at: now,
      claimed_at: params.autoClaim ? now : null,
    });
  }
}

export async function fetchContractSubmitActionsForAdmin(): Promise<ContractSubmitActionRow[]> {
  const res = await fetch('/api/admin/contract-submit-actions', { cache: 'no-store' });
  if (!res.ok) {
    console.error('fetchContractSubmitActionsForAdmin', await res.text());
    return [];
  }
  const data = (await res.json()) as { actions?: ContractSubmitActionRow[] };
  return data.actions ?? [];
}

export async function updateContractSubmitActionStatus(
  id: string,
  status: ContractDealStage,
): Promise<boolean> {
  const res = await fetch('/api/admin/contract-submit-actions', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status }),
  });
  if (!res.ok) {
    console.error('updateContractSubmitActionStatus', await res.text());
    return false;
  }
  return true;
}

/** Update the contract URL/filename without changing deal stage. */
export async function updateContractSubmitActionLink(
  id: string,
  fields: { contractUrl?: string | null; contractFilename?: string | null },
): Promise<ContractSubmitActionRow | null> {
  const res = await fetch('/api/admin/contract-submit-actions', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      op: 'update_contract_link',
      contractUrl: fields.contractUrl,
      contractFilename: fields.contractFilename,
    }),
  });
  if (!res.ok) {
    console.error('updateContractSubmitActionLink', await res.text());
    return null;
  }
  const data = (await res.json()) as { action?: ContractSubmitActionRow };
  return data.action ?? null;
}

export async function findLeadIdForContractSource(params: {
  analysisReviewId?: string | null;
  quoteRequestId?: string | null;
}): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  if (params.analysisReviewId) {
    const { data } = await admin
      .from('portal_leads')
      .select('id')
      .eq('analysis_review_id', params.analysisReviewId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }
  if (params.quoteRequestId) {
    const { data } = await admin
      .from('portal_leads')
      .select('id')
      .eq('quote_request_id', params.quoteRequestId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }
  return null;
}

export async function syncLeadDealStage(params: {
  leadId: string | null;
  stage: ContractDealStage;
  lifecycle?: 'open' | 'converted' | 'closed';
  convertedCustomerId?: string | null;
}): Promise<void> {
  if (!params.leadId) return;
  const admin = createSupabaseAdminClient();
  const patch: Record<string, string | null> = { deal_stage: params.stage };
  if (params.lifecycle) patch.lifecycle = params.lifecycle;
  if (params.convertedCustomerId !== undefined) {
    patch.converted_customer_id = params.convertedCustomerId;
  }
  await admin.from('portal_leads').update(patch).eq('id', params.leadId);
}

/**
 * After admin confirms convert: activate linked account_service as Candid-managed,
 * link lead → CRM customer, and upsert a deals row with saved paysource.
 */
export async function activateConvertedContractDeal(params: {
  action: ContractSubmitActionRow;
  createdBy?: string | null;
}): Promise<{ crmCustomerExternalId: string | null; accountServiceId: string | null }> {
  const admin = createSupabaseAdminClient();
  const action = params.action;
  const now = new Date().toISOString();
  let crmId =
    action.crm_customer_external_id?.trim() ||
    null;

  if (!crmId && action.account_service_id) {
    const { data: svc } = await admin
      .from('account_services')
      .select('crm_customer_id')
      .eq('id', action.account_service_id)
      .maybeSingle();
    crmId = (svc?.crm_customer_id as string | null)?.trim() || null;
  }

  const monthly =
    typeof action.acceptance?.monthlyTotal === 'number' &&
    Number.isFinite(action.acceptance.monthlyTotal)
      ? action.acceptance.monthlyTotal
      : null;
  const monthlyCents =
    monthly != null ? Math.round(monthly * 100) : null;

  if (action.account_service_id) {
    const vendor =
      action.vendor_name?.trim() ||
      action.service_label?.trim() ||
      'Candid service';
    await admin
      .from('account_services')
      .update({
        status: 'active',
        candid_managed: true,
        savings_opportunity_only: false,
        vendor,
        name: vendor,
        ...(monthlyCents != null ? { monthly_amount_cents: monthlyCents } : {}),
        ...(crmId ? { crm_customer_id: crmId } : {}),
        ...(action.contract_filename
          ? { contract_filename: action.contract_filename }
          : {}),
        ...(action.contract_storage_path
          ? { contract_storage_path: action.contract_storage_path }
          : {}),
        updated_at: now,
      })
      .eq('id', action.account_service_id);
  }

  if (action.lead_id) {
    await syncLeadDealStage({
      leadId: action.lead_id,
      stage: 'converted',
      lifecycle: 'converted',
      convertedCustomerId: crmId,
    });

    if (crmId) {
      const { data: leadRow } = await admin
        .from('portal_leads')
        .select('lead_data')
        .eq('id', action.lead_id)
        .maybeSingle();
      const leadData =
        leadRow?.lead_data && typeof leadRow.lead_data === 'object'
          ? { ...(leadRow.lead_data as Record<string, unknown>) }
          : {};
      leadData.lifecycle = 'converted';
      leadData.convertedCustomerId = crmId;
      leadData.dealStage = 'converted';
      leadData.status = 'qualified';
      await admin
        .from('portal_leads')
        .update({ lead_data: leadData })
        .eq('id', action.lead_id);
    }
  }

  if (crmId) {
    await admin
      .from('contract_submit_actions')
      .update({ crm_customer_external_id: crmId, updated_at: now })
      .eq('id', action.id);

    const { data: customer } = await admin
      .from('customers')
      .select('id')
      .eq('external_id', crmId)
      .maybeSingle();

    if (customer?.id) {
      const dealExternalId = `contract-pipeline-${action.id}`;
      const vendor =
        action.vendor_name?.trim() || action.service_label?.trim() || 'Service';
      await admin.from('deals').upsert(
        {
          customer_id: customer.id,
          external_id: dealExternalId,
          pay_source: action.pay_source,
          provider: vendor,
          product: action.service_label,
          deal_status: 'active',
          monthly_cost: monthly,
          contract_data: {
            id: dealExternalId,
            customerId: crmId,
            locationId: '',
            paySource: action.pay_source ?? undefined,
            solution: vendor,
            service: action.service_label,
            vendor,
            monthly: monthly ?? 0,
            dealStatus: 'active',
            expires: '',
            autoRenews: true,
            isCandid: true,
            mrr: monthly ?? undefined,
            contractUrl: action.contract_url ?? undefined,
            contractFilename: action.contract_filename ?? undefined,
          },
          updated_at: now,
        },
        { onConflict: 'external_id' },
      );

      // Prefer updating any existing same-provider active deal that was left at $0
      // (common after replacing an inherited BMW line) so My Services shows MRR.
      if (monthly != null && monthly > 0) {
        const { data: siblingDeals } = await admin
          .from('deals')
          .select('id, external_id, provider, monthly_cost, contract_data')
          .eq('customer_id', customer.id)
          .eq('deal_status', 'active')
          .neq('external_id', dealExternalId);
        const vendorKey = vendor.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        for (const row of siblingDeals ?? []) {
          const providerKey = String(row.provider ?? '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
          const cost = Number(row.monthly_cost);
          const sameVendor =
            providerKey === vendorKey ||
            providerKey.startsWith(vendorKey) ||
            vendorKey.startsWith(providerKey.split(' ')[0] ?? '');
          if (!sameVendor || (Number.isFinite(cost) && cost > 0)) continue;
          const prior =
            row.contract_data && typeof row.contract_data === 'object'
              ? (row.contract_data as Record<string, unknown>)
              : {};
          await admin
            .from('deals')
            .update({
              monthly_cost: monthly,
              contract_data: {
                ...prior,
                monthly,
                mrr: monthly,
                dealStatus: 'active',
              },
              updated_at: now,
            })
            .eq('id', row.id);
        }
      }

      await admin
        .from('customers')
        .update({ status: 'active', updated_at: now })
        .eq('id', customer.id)
        .neq('status', 'active');
    }
  }

  return {
    crmCustomerExternalId: crmId,
    accountServiceId: action.account_service_id,
  };
}
