import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { deliverMemberNotification } from '@/lib/notifications/member-notification-deliver';
import { memberEmailGreeting } from '@/lib/notifications/member-notification-email';
import type { MemberReviewRequestStatus } from '@/lib/services/member-review-requests';

type PatchBody = {
  status?: MemberReviewRequestStatus;
  replyMessage?: string;
  notifyMember?: boolean;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as PatchBody;
  const status = body.status;
  if (!status) {
    return NextResponse.json({ error: 'status required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: existing, error: loadErr } = await admin
    .from('member_review_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const previousStatus = existing.status as MemberReviewRequestStatus;
  const { error: updateErr } = await admin
    .from('member_review_requests')
    .update({ status })
    .eq('id', id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  const shouldNotify =
    body.notifyMember !== false &&
    previousStatus !== status &&
    (status === 'in_progress' || status === 'resolved');

  if (shouldNotify) {
    const reply = body.replyMessage?.trim();
    const serviceName = (existing.service_name as string) || 'your service';
    const subject = (existing.subject as string) || 'Review request';
    const customerName = (existing.customer_name as string | null) ?? 'there';
    const customerEmail = (existing.customer_email as string | null) ?? '';
    const userId = existing.user_id as string;

    const title =
      status === 'resolved'
        ? `Review complete — ${serviceName}`
        : `We're reviewing ${serviceName}`;
    const bodyText =
      reply ||
      (status === 'resolved'
        ? `We've completed your review request for ${serviceName}.`
        : `The Candid team has started reviewing your request for ${serviceName}.`);

    await deliverMemberNotification({
      userId,
      email: customerEmail,
      preferenceKey: 'ticket_responses',
      inApp: {
        type: 'review_request_update',
        title,
        body: bodyText,
        account_service_id: (existing.account_service_id as string | null) ?? null,
        analysis_review_id: (existing.analysis_review_id as string | null) ?? null,
      },
      emailContent: {
        subject: title,
        html: [
          `<p>${memberEmailGreeting(customerName)}</p>`,
          `<p>${bodyText}</p>`,
          `<p><strong>Request:</strong> ${subject}</p>`,
          `<p>Sign in to your Candid portal for details.</p>`,
          `<p>— Candid</p>`,
        ].join(''),
      },
    });
  }

  const { data: updated } = await admin
    .from('member_review_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  return NextResponse.json({ request: updated });
}
