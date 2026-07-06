import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

type PatchBody = {
  status?: 'queued' | 'sent' | 'responded';
  emailBody?: string;
  quoteItemId?: string;
  respondedAt?: string;
  responseSource?: string;
  responseQuote?: Record<string, unknown>;
  responseMessageId?: string;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; rfqId: string }> },
) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, rfqId } = await params;
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const update: Record<string, unknown> = {};
  if (body.status) update.status = body.status;
  if (body.emailBody !== undefined) update.email_body = body.emailBody;
  if (body.quoteItemId) update.quote_item_id = body.quoteItemId;
  if (body.respondedAt) update.responded_at = body.respondedAt;
  if (body.responseSource) update.response_source = body.responseSource;
  if (body.responseQuote) update.response_quote = body.responseQuote;
  if (body.responseMessageId) update.response_message_id = body.responseMessageId;
  if (body.status === 'sent') update.sent_at = new Date().toISOString();

  const { data, error } = await admin
    .from('quote_supplier_rfqs')
    .update(update)
    .eq('id', rfqId)
    .eq('quote_request_id', id)
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.message.includes('quote_supplier_rfqs')) {
      return NextResponse.json({ error: 'Apply migration 0057 first' }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ rfq: data });
}
