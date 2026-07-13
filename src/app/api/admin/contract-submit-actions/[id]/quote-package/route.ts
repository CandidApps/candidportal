import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { parseQuoteCustomerAcceptance } from '@/lib/quotes/quote-acceptance';
import {
  resolveQuotePackage,
  snapshotFromPublished,
} from '@/lib/quotes/quote-package-summary';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/contract-submit-actions/[id]/quote-package */
export async function GET(_request: Request, ctx: Ctx) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: action, error } = await admin
    .from('contract_submit_actions')
    .select(
      'id, acceptance, vendor_name, service_label, analysis_review_id, quote_request_id',
    )
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!action) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let publishedSnapshot = null;
  let reviewAcceptance = null;

  if (action.analysis_review_id) {
    const { data: review } = await admin
      .from('bill_analysis_reviews')
      .select('published_snapshot, customer_acceptance')
      .eq('id', action.analysis_review_id)
      .maybeSingle();
    publishedSnapshot = snapshotFromPublished(review?.published_snapshot);
    reviewAcceptance = parseQuoteCustomerAcceptance(review?.customer_acceptance);
  } else if (action.quote_request_id) {
    const { data: quote } = await admin
      .from('quote_requests')
      .select('published_quote_snapshot, customer_acceptance')
      .eq('id', action.quote_request_id)
      .maybeSingle();
    publishedSnapshot = snapshotFromPublished(quote?.published_quote_snapshot);
    reviewAcceptance = parseQuoteCustomerAcceptance(quote?.customer_acceptance);
  }

  const acceptance =
    parseQuoteCustomerAcceptance(action.acceptance) ?? reviewAcceptance;

  const quotePackage = resolveQuotePackage({
    acceptance,
    snapshot: publishedSnapshot,
    vendorName: (action.vendor_name as string | null) ?? null,
    serviceLabel: (action.service_label as string | null) ?? null,
  });

  return NextResponse.json({
    quotePackage,
    publishedSnapshot,
    acceptance,
  });
}
