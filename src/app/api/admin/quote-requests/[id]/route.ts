import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { deliverMemberNotification } from '@/lib/notifications/member-notification-deliver';
import { memberEmailGreeting } from '@/lib/notifications/member-notification-email';
import { serviceTypeLabel } from '@/lib/services/quote-requests';

type PatchBody = {
  status?: 'open' | 'in_progress' | 'resolved';
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
    .from('quote_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const previousStatus = existing.status as string;
  const { error: updateErr } = await admin.from('quote_requests').update({ status }).eq('id', id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  const shouldNotify =
    body.notifyMember !== false &&
    previousStatus !== status &&
    (status === 'in_progress' || status === 'resolved');

  if (shouldNotify) {
    const reply = body.replyMessage?.trim();
    const serviceLabel = serviceTypeLabel(existing.service_type_id as string | null);
    const subject = (existing.subject as string | null) ?? `Quote request — ${serviceLabel}`;
    const customerName = (existing.contact_name as string | null) ?? 'there';
    const customerEmail = (existing.contact_email as string | null) ?? '';
    const userId = existing.user_id as string;

    const title =
      status === 'resolved'
        ? `Quote request complete — ${serviceLabel}`
        : `We're working on your quote — ${serviceLabel}`;
    const bodyText =
      reply ||
      (status === 'resolved'
        ? `We've completed your quote request for ${serviceLabel}. A specialist will follow up with next steps.`
        : `The Candid team has started working on your quote request for ${serviceLabel}.`);

    await deliverMemberNotification({
      userId,
      email: customerEmail,
      preferenceKey: 'ticket_responses',
      inApp: {
        type: 'quote_request_update',
        title,
        body: bodyText,
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

  const { data: updated } = await admin.from('quote_requests').select('*').eq('id', id).maybeSingle();

  return NextResponse.json({ request: updated });
}
