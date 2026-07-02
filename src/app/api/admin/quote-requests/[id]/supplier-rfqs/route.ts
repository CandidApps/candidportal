import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

type RfqBody = {
  providerId: number;
  providerName: string;
  contactName?: string;
  contactEmail: string;
  rfqSubject: string;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  let body: { rfqs?: RfqBody[] };
  try {
    body = (await request.json()) as { rfqs?: RfqBody[] };
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const rfqs = body.rfqs ?? [];
  if (!rfqs.length) {
    return NextResponse.json({ error: 'rfqs required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: quote, error: quoteErr } = await admin
    .from('quote_requests')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (quoteErr) return NextResponse.json({ error: quoteErr.message }, { status: 500 });
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const now = new Date().toISOString();
  const rows = rfqs.map((r) => ({
    quote_request_id: id,
    provider_id: r.providerId,
    provider_name: r.providerName,
    contact_name: r.contactName ?? null,
    contact_email: r.contactEmail,
    status: 'sent',
    rfq_subject: r.rfqSubject,
    sent_at: now,
    created_at: now,
  }));

  const { data, error } = await admin.from('quote_supplier_rfqs').insert(rows).select('*');
  if (error) {
    if (error.message.includes('quote_supplier_rfqs')) {
      return NextResponse.json({ error: 'Apply migration 0054 first', rfqs: [] }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin
    .from('quote_requests')
    .update({ status: 'in_progress', updated_at: now })
    .eq('id', id)
    .eq('status', 'open');

  return NextResponse.json({ rfqs: data ?? [] });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('quote_supplier_rfqs')
    .select('*')
    .eq('quote_request_id', id)
    .order('sent_at', { ascending: false });

  if (error) {
    if (error.message.includes('quote_supplier_rfqs')) {
      return NextResponse.json({ rfqs: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rfqs: data ?? [] });
}
