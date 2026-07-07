import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  getActiveConnectionForUser,
  getActiveSharedConnection,
} from '@/lib/email/zoho-connections';
import { getMessageContent, searchConversation } from '@/lib/email/zoho';
import { detectQuoteInEmailContent } from '@/lib/quotes/detect-supplier-quote-response';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const connection =
    (await getActiveConnectionForUser(user.id)) ?? (await getActiveSharedConnection());
  if (!connection) {
    return NextResponse.json({ error: 'No Zoho mailbox connected' }, { status: 409 });
  }

  const admin = createSupabaseAdminClient();
  const { data: rfqs, error } = await admin
    .from('quote_supplier_rfqs')
    .select('*')
    .eq('quote_request_id', id)
    .in('status', ['sent', 'queued'])
    .order('sent_at', { ascending: false });

  if (error) {
    if (error.message.includes('quote_supplier_rfqs')) {
      return NextResponse.json({ detected: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const detected: Array<{ rfqId: string; quoteItemId?: string; quote: Record<string, unknown> }> = [];

  for (const rfq of rfqs ?? []) {
    if (rfq.status === 'responded') continue;
    const email = String(rfq.contact_email ?? '').trim().toLowerCase();
    if (!email) continue;

    const sentAt = new Date(String(rfq.sent_at ?? rfq.created_at)).getTime();
    const messages = await searchConversation({
      accessToken: connection.accessToken,
      accountId: connection.accountId,
      email,
      limit: 20,
    });

    const reply = messages.find(
      (m) =>
        m.receivedTime >= sentAt - 60_000 &&
        m.fromAddress.toLowerCase().includes(email.split('@')[0] ?? email),
    );
    if (!reply) continue;

    let body = reply.summary;
    try {
      const content = await getMessageContent({
        accessToken: connection.accessToken,
        accountId: connection.accountId,
        messageId: reply.messageId,
        folderId: reply.folderId,
      });
      if (content?.trim()) body = content;
    } catch {
      /* use summary */
    }

    const found = detectQuoteInEmailContent({
      subject: reply.subject,
      body,
      hasAttachment: reply.hasAttachment,
    });
    if (!found) continue;

    const now = new Date().toISOString();
    const responseQuote = {
      name: found.name ?? 'Supplier quote',
      url: found.url,
      mimeType: found.url?.endsWith('.pdf') ? 'application/pdf' : undefined,
      excerpt: found.excerpt,
    };

    await admin
      .from('quote_supplier_rfqs')
      .update({
        status: 'responded',
        responded_at: now,
        response_source: found.source,
        response_quote: responseQuote,
        response_message_id: reply.messageId,
      })
      .eq('id', rfq.id);

    detected.push({
      rfqId: rfq.id,
      quoteItemId: rfq.quote_item_id ?? undefined,
      quote: responseQuote,
    });
  }

  return NextResponse.json({ detected });
}
