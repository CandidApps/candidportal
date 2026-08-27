import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { resolvePortalCustomerForRequest } from '@/lib/portal/member-customer-resolve';
import type { AccountServiceRow } from '@/lib/services/account-services';
import type { BillParseResult, PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';

export const dynamic = 'force-dynamic';

/**
 * Account services visible to the signed-in portal member.
 * Scoped to CRM account when known so admin-created savings quotes appear for the customer.
 */
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const portalCustomer = await resolvePortalCustomerForRequest({
    email: user.email,
    customerExternalId: url.searchParams.get('customerId'),
  });
  const customerExternalId = portalCustomer?.customerExternalId?.trim() || null;

  const admin = createSupabaseAdminClient();

  try {
    let rows: AccountServiceRow[] = [];

    if (customerExternalId) {
      const { data, error } = await admin
        .from('account_services')
        .select('*')
        .eq('crm_customer_id', customerExternalId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      rows = (data as AccountServiceRow[]) ?? [];

      // Also include the member's own rows missing CRM linkage (legacy uploads).
      const { data: own } = await admin
        .from('account_services')
        .select('*')
        .eq('user_id', user.id)
        .or(`crm_customer_id.is.null,crm_customer_id.neq.${customerExternalId}`)
        .order('created_at', { ascending: false });
      const seen = new Set(rows.map((r) => r.id));
      for (const row of (own as AccountServiceRow[]) ?? []) {
        if (!seen.has(row.id)) rows.push(row);
      }
    } else {
      const { data, error } = await admin
        .from('account_services')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      rows = (data as AccountServiceRow[]) ?? [];
    }

    const reviewIds = rows
      .map((r) => r.analysis_review_id)
      .filter((id): id is string => Boolean(id));

    const reviewsById: Record<
      string,
      {
        parse_result: BillParseResult | null;
        detected_categories: string[] | null;
        published_snapshot: PublishedAnalysisSnapshot | null;
        status: string;
      }
    > = {};

    if (reviewIds.length) {
      const { data: reviews, error: reviewErr } = await admin
        .from('bill_analysis_reviews')
        .select('id, parse_result, detected_categories, published_snapshot, status')
        .in('id', reviewIds);
      if (reviewErr && !reviewErr.message.includes('bill_analysis_reviews')) {
        throw new Error(reviewErr.message);
      }
      for (const r of reviews ?? []) {
        reviewsById[r.id as string] = {
          parse_result: (r.parse_result as BillParseResult) ?? null,
          detected_categories: Array.isArray(r.detected_categories)
            ? (r.detected_categories as string[])
            : null,
          published_snapshot: (r.published_snapshot as PublishedAnalysisSnapshot) ?? null,
          status: String(r.status ?? ''),
        };
      }
    }

    return NextResponse.json({ services: rows, reviewsById });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load services';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
