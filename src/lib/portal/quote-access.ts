import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getMyRole } from '@/lib/auth/roles';
import { resolvePortalCustomerForRequest } from '@/lib/portal/member-customer-resolve';

export type PortalQuoteRequestRow = {
  id: string;
  user_id: string;
  crm_customer_id: string | null;
  subject: string | null;
  company: string | null;
  contact_name: string | null;
  contact_email: string | null;
  vendor_names: string[] | null;
  services: string[] | null;
  published_quote_snapshot: unknown;
  published_at: string | null;
  published_by: string | null;
  customer_accepted_at: string | null;
  customer_acceptance: unknown;
};

export type PortalAnalysisReviewRow = {
  id: string;
  user_id: string;
  status: string;
  vendor_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  account_service_id: string | null;
  crm_customer_id: string | null;
  published_snapshot: unknown;
  published_by: string | null;
  customer_accepted_at: string | null;
  customer_acceptance: unknown;
};

type AccessResult<T> = { row: T } | { error: string; status: number };

async function portalCustomerMatchesRow(
  email: string | null | undefined,
  customerExternalId: string | null | undefined,
  rowCrmCustomerId: string | null | undefined,
): Promise<boolean> {
  const crmId = rowCrmCustomerId?.trim();
  if (!crmId) return false;
  const portalCustomer = await resolvePortalCustomerForRequest({
    email,
    customerExternalId,
  });
  return Boolean(portalCustomer && portalCustomer.customerExternalId === crmId);
}

/** Quote request visible to signed-in portal user (owner, CRM account, or admin preview). */
export async function assertPortalQuoteRequestAccess(opts: {
  quoteRequestId: string;
  userId: string;
  email: string | null | undefined;
  customerExternalId?: string | null;
  requirePublished?: boolean;
}): Promise<AccessResult<PortalQuoteRequestRow>> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('quote_requests')
    .select(
      'id, user_id, crm_customer_id, subject, company, contact_name, contact_email, vendor_names, services, published_quote_snapshot, published_at, published_by, customer_accepted_at, customer_acceptance',
    )
    .eq('id', opts.quoteRequestId)
    .maybeSingle();

  if (error) return { error: error.message, status: 500 };
  if (!data) return { error: 'Not found', status: 404 };

  const row = data as PortalQuoteRequestRow;

  if (opts.requirePublished && !row.published_quote_snapshot && !row.published_at) {
    return { error: 'Quote is not published yet', status: 400 };
  }

  if (row.user_id === opts.userId) return { row };

  if ((await getMyRole()) === 'admin') return { row };

  if (
    await portalCustomerMatchesRow(opts.email, opts.customerExternalId, row.crm_customer_id)
  ) {
    return { row };
  }

  return { error: 'Not found', status: 404 };
}

/** Published analysis review visible to signed-in portal user. */
export async function assertPortalAnalysisReviewAccess(opts: {
  analysisReviewId: string;
  userId: string;
  email: string | null | undefined;
  customerExternalId?: string | null;
  requirePublished?: boolean;
}): Promise<AccessResult<PortalAnalysisReviewRow>> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('bill_analysis_reviews')
    .select(
      'id, user_id, status, vendor_name, customer_name, customer_email, account_service_id, crm_customer_id, published_snapshot, published_by, customer_accepted_at, customer_acceptance',
    )
    .eq('id', opts.analysisReviewId)
    .maybeSingle();

  if (error) return { error: error.message, status: 500 };
  if (!data) return { error: 'Not found', status: 404 };

  const row = data as PortalAnalysisReviewRow;

  if (opts.requirePublished && row.status !== 'published') {
    return { error: 'Quote is not published yet', status: 400 };
  }

  if (row.user_id === opts.userId) return { row };

  if ((await getMyRole()) === 'admin') return { row };

  if (
    await portalCustomerMatchesRow(opts.email, opts.customerExternalId, row.crm_customer_id)
  ) {
    return { row };
  }

  return { error: 'Not found', status: 404 };
}
