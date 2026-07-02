import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { deliverMemberNotification } from '@/lib/notifications/member-notification-deliver';
import { memberEmailGreeting } from '@/lib/notifications/member-notification-email';
import { resolveQuoteServiceLabel } from '@/lib/services/quote-requests';
import type { PublishedQuoteSnapshot } from '@/lib/quotes/types';

type PatchBody = {
  status?: 'open' | 'in_progress' | 'resolved';
  replyMessage?: string;
  notifyMember?: boolean;
  adminNotes?: string;
  draftQuoteSnapshot?: PublishedQuoteSnapshot | null;
  publish?: boolean;
};

function hasDeliverable(snapshot: PublishedQuoteSnapshot | null | undefined): boolean {
  if (!snapshot) return false;
  if (snapshot.ucaasQuote?.lines?.length) return true;
  if (snapshot.proposalDocument?.url) return true;
  if (snapshot.adminMessage?.trim()) return true;
  return false;
}

function quoteRowServiceLabel(existing: Record<string, unknown>): string {
  return resolveQuoteServiceLabel({
    service_type_id: (existing.service_type_id as string | null) ?? null,
    services: (existing.services as string[] | null) ?? [],
    note: (existing.note as string | null) ?? null,
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from('quote_requests').select('*').eq('id', id).maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: rfqs } = await admin
    .from('quote_supplier_rfqs')
    .select('*')
    .eq('quote_request_id', id)
    .order('sent_at', { ascending: false });

  return NextResponse.json({ request: data, supplierRfqs: rfqs ?? [] });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as PatchBody;
  const admin = createSupabaseAdminClient();
  const { data: existing, error: loadErr } = await admin
    .from('quote_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const previousStatus = existing.status as string;
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: now };

  if (body.adminNotes !== undefined) update.admin_notes = body.adminNotes;
  if (body.draftQuoteSnapshot !== undefined) update.draft_quote_snapshot = body.draftQuoteSnapshot;

  let publishedSnapshot: PublishedQuoteSnapshot | null = null;

  if (body.publish) {
    const draft = (body.draftQuoteSnapshot ?? existing.draft_quote_snapshot) as PublishedQuoteSnapshot | null;
    if (!hasDeliverable(draft)) {
      return NextResponse.json(
        { error: 'Add a quote (UCaaS builder, proposal document, or message) before publishing.' },
        { status: 400 },
      );
    }
    publishedSnapshot = {
      ...draft!,
      serviceTypeId: draft!.serviceTypeId ?? (existing.service_type_id as string | null),
      serviceLabel: draft!.serviceLabel ?? quoteRowServiceLabel(existing),
      publishedAt: now,
    };
    update.published_quote_snapshot = publishedSnapshot;
    update.published_at = now;
    update.status = 'resolved';
    if (existing.status !== 'in_progress') update.status = 'resolved';
  } else if (body.status) {
    update.status = body.status;
  }

  const { error: updateErr } = await admin.from('quote_requests').update(update).eq('id', id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  const nextStatus = (update.status as string | undefined) ?? previousStatus;

  if (body.publish && publishedSnapshot) {
    const serviceLabel = publishedSnapshot.serviceLabel ?? quoteRowServiceLabel(existing);
    const customerName = (existing.contact_name as string | null) ?? 'there';
    const customerEmail = (existing.contact_email as string | null) ?? '';
    const userId = existing.user_id as string;
    const adminMessage = publishedSnapshot.adminMessage?.trim();
    const title = `Your quote is ready — ${serviceLabel}`;
    const bodyText =
      adminMessage ||
      `We've prepared your quote for ${serviceLabel}. Sign in to review pricing and next steps.`;

    await deliverMemberNotification({
      userId,
      email: customerEmail,
      preferenceKey: 'ticket_responses',
      inApp: {
        type: 'quote_published',
        title,
        body: bodyText,
        quote_request_id: id,
      },
      emailContent: {
        subject: title,
        html: [
          `<p>${memberEmailGreeting(customerName)}</p>`,
          `<p>${bodyText}</p>`,
          `<p>Sign in to your Candid portal to view your quote.</p>`,
          `<p>— Candid</p>`,
        ].join(''),
      },
    });

    const { data: threadRow } = await admin
      .from('customer_message_threads')
      .select('id')
      .eq('quote_request_id', id)
      .maybeSingle();

    if (threadRow?.id) {
      await admin.from('customer_messages').insert({
        thread_id: threadRow.id,
        user_id: userId,
        author: 'team',
        body: `${bodyText}\n\nOpen your portal Alerts to view the full quote.`,
        attachments: [],
        created_at: now,
      });
      await admin
        .from('customer_message_threads')
        .update({ updated_at: now })
        .eq('id', threadRow.id);
    }
  } else {
    const shouldNotify =
      body.notifyMember !== false &&
      body.status &&
      previousStatus !== nextStatus &&
      (nextStatus === 'in_progress' || nextStatus === 'resolved') &&
      !body.publish;

    if (shouldNotify) {
      const reply = body.replyMessage?.trim();
      const serviceLabel = quoteRowServiceLabel(existing);
      const subject = (existing.subject as string | null) ?? `Quote request — ${serviceLabel}`;
      const customerName = (existing.contact_name as string | null) ?? 'there';
      const customerEmail = (existing.contact_email as string | null) ?? '';
      const userId = existing.user_id as string;

      const title =
        nextStatus === 'resolved'
          ? `Quote request complete — ${serviceLabel}`
          : `We're working on your quote — ${serviceLabel}`;
      const bodyText =
        reply ||
        (nextStatus === 'resolved'
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
          quote_request_id: id,
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
  }

  const { data: updated } = await admin.from('quote_requests').select('*').eq('id', id).maybeSingle();
  return NextResponse.json({ request: updated });
}
