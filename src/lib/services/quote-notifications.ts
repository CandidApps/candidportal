import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isLocalPersistence } from '@/lib/persistence/config';
import {
  appendLocalCustomerTeamMessage,
  findLocalThreadByQuoteRequest,
} from '@/lib/persistence/local-message-center';
import { serviceTypeLabel } from '@/lib/services/quote-requests';

export function quoteRequestSubmittedMessageBody(serviceLabel: string): string {
  return (
    `Thanks for your quote request for ${serviceLabel}. Our Candid specialist is reviewing your ` +
    `details now. We'll message you here when your quote is ready — typically within 1–2 business days.`
  );
}

/** Message Center notice after the customer submits a quote request. */
export async function createQuoteRequestSubmittedMessage(params: {
  userId: string;
  quoteRequestId: string;
  serviceTypeId: string | null;
  subject: string;
}): Promise<{ threadId: string } | null> {
  const serviceLabel = serviceTypeLabel(params.serviceTypeId);
  const body = quoteRequestSubmittedMessageBody(serviceLabel);

  if (isLocalPersistence()) {
    const existing = findLocalThreadByQuoteRequest(params.userId, params.quoteRequestId);
    if (existing) return { threadId: existing.id };
    const threadId = appendLocalCustomerTeamMessage({
      userId: params.userId,
      subject: params.subject,
      category: 'quote_request',
      quoteRequestId: params.quoteRequestId,
      body,
    });
    return { threadId };
  }

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from('customer_message_threads')
    .select('id')
    .eq('user_id', params.userId)
    .eq('quote_request_id', params.quoteRequestId)
    .maybeSingle();

  if (existing?.id) {
    return { threadId: existing.id as string };
  }

  const now = new Date().toISOString();
  const { data: thread, error: threadErr } = await admin
    .from('customer_message_threads')
    .insert({
      user_id: params.userId,
      subject: params.subject,
      category: 'quote_request',
      status: 'open',
      critical: false,
      quote_request_id: params.quoteRequestId,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();

  if (threadErr || !thread?.id) {
    if (threadErr?.message?.includes('quote_request_id')) {
      console.warn('[quote-request-message] quote_request_id column missing — apply migration 0054');
    } else {
      console.error('[quote-request-message] thread insert failed', threadErr?.message);
    }
    return null;
  }

  const { error: msgErr } = await admin.from('customer_messages').insert({
    thread_id: thread.id,
    user_id: params.userId,
    author: 'team',
    body,
    attachments: [],
    created_at: now,
  });

  if (msgErr) {
    console.error('[quote-request-message] message insert failed', msgErr.message);
    return null;
  }

  return { threadId: thread.id as string };
}
