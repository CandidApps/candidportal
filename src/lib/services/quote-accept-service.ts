import type { SupabaseClient } from '@supabase/supabase-js';
import { logoKeyFromLabel } from '@/lib/services/account-services';

/** Ensure a Candid-managed pending service exists when a customer accepts a quote. */
export async function ensureAccountServiceForAcceptance(
  admin: SupabaseClient,
  params: {
    userId: string;
    accountServiceId: string | null;
    serviceLabel: string;
    vendorName: string | null;
    crmCustomerExternalId: string | null;
    monthlyTotal: number | null;
  },
): Promise<string | null> {
  const now = new Date().toISOString();
  const label = params.serviceLabel.trim() || 'Accepted quote';
  const vendor = params.vendorName?.trim() || label;
  const monthlyCents =
    params.monthlyTotal != null && Number.isFinite(params.monthlyTotal)
      ? Math.round(params.monthlyTotal * 100)
      : null;

  if (params.accountServiceId) {
    const { data: existing } = await admin
      .from('account_services')
      .select('status, candid_managed, bill_storage_path, analysis_review_id')
      .eq('id', params.accountServiceId)
      .maybeSingle();

    const patch: Record<string, unknown> = {
      candid_managed: true,
      savings_opportunity_only: false,
      updated_at: now,
    };
    if (monthlyCents != null) patch.monthly_amount_cents = monthlyCents;
    if (params.crmCustomerExternalId) patch.crm_customer_id = params.crmCustomerExternalId;

    const needsPendingSetup =
      !existing ||
      existing.status === 'external' ||
      existing.status === 'pending_analysis' ||
      existing.candid_managed === false;

    if (needsPendingSetup) {
      patch.status = 'pending_analysis';
      patch.name = label;
      patch.vendor = vendor;
    }

    await admin.from('account_services').update(patch).eq('id', params.accountServiceId);
    return params.accountServiceId;
  }

  const { data: inserted, error } = await admin
    .from('account_services')
    .insert({
      user_id: params.userId,
      name: label,
      vendor,
      status: 'pending_analysis',
      candid_managed: true,
      savings_opportunity_only: false,
      monthly_amount_cents: monthlyCents,
      crm_customer_id: params.crmCustomerExternalId,
      logo_key: logoKeyFromLabel(vendor),
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();

  if (error) {
    console.warn('[quote-accept] account_service insert failed', error.message);
    return null;
  }
  return (inserted?.id as string) ?? null;
}
