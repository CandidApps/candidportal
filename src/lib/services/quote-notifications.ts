import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isLocalPersistence } from '@/lib/persistence/config';
import {
  appendLocalCustomerTeamMessage,
  findLocalThreadByQuoteRequest,
} from '@/lib/persistence/local-message-center';
import { deliverMemberNotification } from '@/lib/notifications/member-notification-deliver';
import { memberEmailGreeting } from '@/lib/notifications/member-notification-email';
import {
  CANDID_MEMBER_CONTACT_EMAIL,
  CANDID_SCHEDULING_URL,
  MEMBER_RESPONSE_SLA_HOURS,
} from '@/lib/member-request-sla';
import { serviceTypeLabel } from '@/lib/services/quote-requests';

export function quoteRequestSubmittedMessageBody(serviceLabel: string): string {
  return (
    `Thanks for your quote request for ${serviceLabel}. Our Candid specialist is reviewing your ` +
    `details now. We'll message you here when your quote is ready — allow up to ${MEMBER_RESPONSE_SLA_HOURS} hours. ` +
    `If this is urgent, contact us at ${CANDID_MEMBER_CONTACT_EMAIL} or schedule time on our calendar.`
  );
}

export function quoteRequestSubmittedNotificationBody(summary?: string): string {
  const base = `We received your request and will follow up within ${MEMBER_RESPONSE_SLA_HOURS} hours.`;
  return summary ? `${base} (${summary})` : base;
}

/** Email confirmation after a customer submits a quote request. */
export async function sendQuoteRequestSubmittedEmail(params: {
  userId: string;
  email: string;
  customerName?: string | null;
  serviceLabel: string;
  summary?: string;
}): Promise<void> {
  const greeting = memberEmailGreeting(params.customerName ?? 'there');
  const bodyIntro = quoteRequestSubmittedNotificationBody(params.summary);
  await deliverMemberNotification({
    userId: params.userId,
    email: params.email,
    preferenceKey: 'analysis_complete',
    forceEmail: true,
    emailContent: {
      subject: `Quote request received — ${params.serviceLabel}`,
      html: [
        `<p>${greeting}</p>`,
        `<p>${bodyIntro}</p>`,
        `<p><strong>Our ${MEMBER_RESPONSE_SLA_HOURS}-hour commitment:</strong> A Candid specialist will review your request and respond within ${MEMBER_RESPONSE_SLA_HOURS} hours.</p>`,
        `<p>If this is urgent, reply to this email, contact us at <a href="mailto:${CANDID_MEMBER_CONTACT_EMAIL}">${CANDID_MEMBER_CONTACT_EMAIL}</a>, or <a href="${CANDID_SCHEDULING_URL}">schedule time on our calendar</a>.</p>`,
        `<p>Sign in to your Candid portal to track progress under <strong>Your requests</strong> on the dashboard.</p>`,
        `<p>— Candid</p>`,
      ].join(''),
    },
  });
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
