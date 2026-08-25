import type { SupabaseClient } from '@supabase/supabase-js';
import { logoKeyFromLabel } from '@/lib/services/account-services';
import type { QuoteRequestRow } from '@/lib/services/quote-requests';
import type { ServiceSavingsBaseline } from '@/lib/services/service-savings';
import {
  buildSavingsBaselineFromPublishedQuote,
  proposedMonthlyFromPublishedQuote,
} from '@/lib/quotes/published-quote-savings';

function proposedVendorFromQuote(quote: Pick<QuoteRequestRow, 'published_quote_snapshot' | 'vendor_names' | 'services'>): string | null {
  const snap = quote.published_quote_snapshot;
  return (
    quote.vendor_names?.[0]?.trim() ||
    snap?.matchedProviderName?.trim() ||
    snap?.quoteItems?.find((i) => i.matchedProviderName?.trim())?.matchedProviderName?.trim() ||
    snap?.quoteItems?.find((i) => i.providerName?.trim())?.providerName?.trim() ||
    quote.services?.[0]?.trim() ||
    null
  );
}

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
    savingsBaseline?: ServiceSavingsBaseline | null;
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
      .select('status, candid_managed, bill_storage_path, analysis_review_id, savings_baseline')
      .eq('id', params.accountServiceId)
      .maybeSingle();

    const patch: Record<string, unknown> = {
      candid_managed: true,
      savings_opportunity_only: false,
      updated_at: now,
    };
    if (monthlyCents != null) patch.monthly_amount_cents = monthlyCents;
    if (params.crmCustomerExternalId) patch.crm_customer_id = params.crmCustomerExternalId;
    if (params.savingsBaseline && !existing?.savings_baseline) {
      patch.savings_baseline = params.savingsBaseline;
    }

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
      ...(params.savingsBaseline ? { savings_baseline: params.savingsBaseline } : {}),
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[quote-accept] account_service insert failed', error.message);
    return null;
  }
  return (inserted?.id as string) ?? null;
}

/** Backfill account service + pipeline link when a quote was accepted before services existed. */
export async function repairAcceptedQuoteMemberServices(
  admin: SupabaseClient,
  params: {
    userId: string;
    quoteRequestId: string;
    quote: Pick<
      QuoteRequestRow,
      | 'customer_accepted_at'
      | 'customer_acceptance'
      | 'published_quote_snapshot'
      | 'crm_customer_id'
      | 'subject'
      | 'company'
      | 'vendor_names'
      | 'services'
      | 'published_at'
    >;
    crmCustomerExternalId?: string | null;
  },
): Promise<string | null> {
  if (!params.quote.customer_accepted_at) return null;

  const snap = params.quote.published_quote_snapshot;
  const serviceLabel =
    params.quote.customer_acceptance?.serviceLabel?.trim() ||
    params.quote.subject?.trim() ||
    params.quote.company?.trim() ||
    'Accepted quote';
  const vendorName = proposedVendorFromQuote(params.quote);
  const crmId =
    params.crmCustomerExternalId?.trim() ||
    params.quote.crm_customer_id?.trim() ||
    null;
  const savingsBaseline = buildSavingsBaselineFromPublishedQuote(
    snap,
    params.quote.customer_acceptance,
    params.quote.customer_accepted_at || params.quote.published_at,
  );
  const monthlyTotal =
    params.quote.customer_acceptance?.monthlyTotal ??
    proposedMonthlyFromPublishedQuote(snap);

  const { data: pipeline } = await admin
    .from('contract_submit_actions')
    .select('id, account_service_id')
    .eq('quote_request_id', params.quoteRequestId)
    .maybeSingle();

  let accountServiceId = pipeline?.account_service_id
    ? String(pipeline.account_service_id)
    : null;

  accountServiceId =
    (await ensureAccountServiceForAcceptance(admin, {
      userId: params.userId,
      accountServiceId,
      serviceLabel,
      vendorName,
      crmCustomerExternalId: crmId,
      monthlyTotal,
      savingsBaseline,
    })) ?? accountServiceId;

  if (accountServiceId && pipeline?.id) {
    await admin
      .from('contract_submit_actions')
      .update({
        account_service_id: accountServiceId,
        ...(vendorName ? { vendor_name: vendorName } : {}),
        ...(crmId ? { crm_customer_external_id: crmId } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', pipeline.id);
  }

  return accountServiceId;
}
