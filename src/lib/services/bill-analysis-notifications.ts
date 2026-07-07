import type { MessageAttachment } from '@/app/api/portal/message-center/route';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isLocalPersistence } from '@/lib/persistence/config';
import {
  appendLocalCustomerTeamMessage,
  findLocalThreadByAnalysisReview,
} from '@/lib/persistence/local-message-center';

export function billAnalysisSubmittedMessageBody(vendorName: string, categoryLabel: string): string {
  return (
    `Thanks for confirming your ${vendorName} bill details. Our Candid specialist is reviewing your ` +
    `${categoryLabel} bill now. We'll message you here when your savings analysis is ready — ` +
    `typically within 24–72 hours.`
  );
}

/** Message Center notice after the customer submits bill confirmation (Prompt E). */
export async function createBillAnalysisSubmittedMessage(params: {
  userId: string;
  vendorName: string;
  categoryLabel: string;
  analysisReviewId: string;
}): Promise<{ threadId: string } | null> {
  const subject = `Bill analysis — ${params.vendorName}`;
  const body = billAnalysisSubmittedMessageBody(params.vendorName, params.categoryLabel);

  if (isLocalPersistence()) {
    const existing = findLocalThreadByAnalysisReview(params.userId, params.analysisReviewId);
    if (existing) return { threadId: existing.id };
    const threadId = appendLocalCustomerTeamMessage({
      userId: params.userId,
      subject,
      category: 'bill_analysis',
      supplierName: params.vendorName,
      analysisReviewId: params.analysisReviewId,
      body,
    });
    return { threadId };
  }

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from('customer_message_threads')
    .select('id')
    .eq('user_id', params.userId)
    .eq('analysis_review_id', params.analysisReviewId)
    .maybeSingle();

  if (existing?.id) {
    return { threadId: existing.id as string };
  }

  const now = new Date().toISOString();
  const { data: thread, error: threadErr } = await admin
    .from('customer_message_threads')
    .insert({
      user_id: params.userId,
      subject,
      category: 'bill_analysis',
      status: 'open',
      critical: false,
      supplier_name: params.vendorName,
      analysis_review_id: params.analysisReviewId,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();

  if (threadErr || !thread?.id) {
    console.error('[bill-analysis-message] thread insert failed', threadErr?.message);
    return null;
  }

  const attachments: MessageAttachment[] = [];
  const { error: msgErr } = await admin.from('customer_messages').insert({
    thread_id: thread.id,
    user_id: params.userId,
    author: 'team',
    body,
    attachments,
    created_at: now,
  });

  if (msgErr) {
    console.error('[bill-analysis-message] message insert failed', msgErr.message);
    return null;
  }

  return { threadId: thread.id as string };
}
