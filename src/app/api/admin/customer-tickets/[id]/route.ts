import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { deliverMemberNotification } from '@/lib/notifications/member-notification-deliver';
import { memberEmailGreeting } from '@/lib/notifications/member-notification-email';
import type { CustomerTicketStatus } from '@/lib/services/customer-tickets';

type PatchBody = {
  status?: CustomerTicketStatus;
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
    .from('customer_service_tickets')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const previousStatus = existing.status as CustomerTicketStatus;
  const { error: updateErr } = await admin
    .from('customer_service_tickets')
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
    const subject = (existing.subject as string) || 'Support ticket';
    const customerName = (existing.customer_name as string | null) ?? 'there';
    const customerEmail = (existing.customer_email as string | null) ?? '';
    const userId = existing.user_id as string;

    const title =
      status === 'resolved'
        ? `Ticket resolved — ${subject}`
        : `Update on your ticket — ${subject}`;
    const bodyText =
      reply ||
      (status === 'resolved'
        ? `We've resolved your support request for ${serviceName}.`
        : `The Candid team is working on your request for ${serviceName}.`);

    await deliverMemberNotification({
      userId,
      email: customerEmail,
      preferenceKey: 'ticket_responses',
      inApp: {
        type: 'ticket_response',
        title,
        body: bodyText,
        account_service_id: (existing.account_service_id as string | null) ?? null,
      },
      emailContent: {
        subject: title,
        html: [
          `<p>${memberEmailGreeting(customerName)}</p>`,
          `<p>${bodyText}</p>`,
          `<p><strong>Service:</strong> ${serviceName}</p>`,
          `<p>Sign in to your Candid portal to view the ticket.</p>`,
          `<p>— Candid</p>`,
        ].join(''),
      },
    });
  }

  const { data: updated } = await admin
    .from('customer_service_tickets')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  return NextResponse.json({ ticket: updated });
}
