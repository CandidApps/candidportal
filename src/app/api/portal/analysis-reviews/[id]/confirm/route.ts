import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { BillParseResult } from '@/lib/bill-parse-types';
import { mapReviewRow } from '@/lib/services/analysis-reviews';
import { isLocalPersistence } from '@/lib/persistence/config';
import { submitLocalBillAnalysisConfirmation } from '@/lib/persistence/local-analysis-review';
import type { BillAnalysisConfirmPayload } from '@/lib/bill-analysis-confirm';
import { buildConfirmAdminNotes, buildCustomerConfirmation } from '@/lib/bill-analysis-confirm';
import { getUcaasPhoneLines } from '@/lib/bill-parse-phones';
import { createBillAnalysisSubmittedMessage } from '@/lib/services/bill-analysis-notifications';

export const dynamic = 'force-dynamic';

/** Customer confirms parsed bill details and sends optional notes to the Candid team. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: reviewId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: BillAnalysisConfirmPayload;
  try {
    body = (await request.json()) as BillAnalysisConfirmPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (isLocalPersistence()) {
    try {
      const review = submitLocalBillAnalysisConfirmation(reviewId, user.id, body);
      return NextResponse.json({ review });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Confirm failed';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const { data: existing, error: fetchError } = await supabase
    .from('bill_analysis_reviews')
    .select('id, user_id, parse_result, vendor_name, submitted_at')
    .eq('id', reviewId)
    .maybeSingle();

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Review not found' }, { status: 404 });
  }
  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (existing.submitted_at) {
    return NextResponse.json({ review: mapReviewRow(existing) });
  }

  const now = new Date().toISOString();
  const parseResult = (existing.parse_result ?? {}) as BillParseResult;
  const phoneLines = getUcaasPhoneLines(parseResult);
  const updatedParse: BillParseResult = {
    ...parseResult,
    customerConfirmation: buildCustomerConfirmation(body, now),
  };

  const adminNoteBlock = buildConfirmAdminNotes(body, phoneLines, now);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('bill_analysis_reviews')
    .update({
      parse_result: updatedParse,
      submitted_at: now,
      submitted_by: user.id,
      admin_notes: adminNoteBlock,
      updated_at: now,
    })
    .eq('id', reviewId)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const mapped = mapReviewRow(data);
  await createBillAnalysisSubmittedMessage({
    userId: user.id,
    vendorName: mapped.vendor_name,
    categoryLabel: mapped.category_label ?? mapped.detected_category,
    analysisReviewId: reviewId,
  });

  return NextResponse.json({ review: mapped });
}
