import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { resolvePortalCustomerForRequest } from '@/lib/portal/member-customer-resolve';
import { fetchQuoteRequestsForPortalCustomer } from '@/lib/services/quote-request-crm-link';
import { mapQuoteRequestRow, type QuoteRequestDbRow } from '@/lib/services/quote-requests';
import { mapReviewRow } from '@/lib/services/analysis-reviews';
import { CLOSED_REQUEST_STATUSES, isClosedRequestStatus } from '@/lib/services/request-close';

export const dynamic = 'force-dynamic';

/** Closed / cancelled quote requests and analyses for the signed-in member's account. */
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const portalCustomer = await resolvePortalCustomerForRequest({
    email: user.email,
    customerExternalId: new URL(request.url).searchParams.get('customerId'),
  });
  const customerId = portalCustomer?.customerExternalId?.trim() || null;
  const admin = createSupabaseAdminClient();
  const statuses = [...CLOSED_REQUEST_STATUSES];

  try {
    const quoteRows = customerId
      ? (await fetchQuoteRequestsForPortalCustomer(admin, customerId, { scope: 'all' })).filter((r) =>
          isClosedRequestStatus(r.status as string),
        )
      : ((
          await admin
            .from('quote_requests')
            .select('*')
            .eq('user_id', user.id)
            .in('status', statuses)
            .order('closed_at', { ascending: false })
            .limit(50)
        ).data ?? []);

    let analysisQuery = admin.from('bill_analysis_reviews').select('*').in('status', statuses);
    analysisQuery = customerId
      ? analysisQuery.or(`crm_customer_id.eq.${customerId},user_id.eq.${user.id}`)
      : analysisQuery.eq('user_id', user.id);
    const { data: analysisRows } = await analysisQuery.order('closed_at', { ascending: false }).limit(50);

    return NextResponse.json({
      quotes: quoteRows.map((r) => mapQuoteRequestRow(r as QuoteRequestDbRow)),
      analyses: (analysisRows ?? []).map((r) => mapReviewRow(r as Record<string, unknown>)),
    });
  } catch {
    return NextResponse.json({ quotes: [], analyses: [] });
  }
}
