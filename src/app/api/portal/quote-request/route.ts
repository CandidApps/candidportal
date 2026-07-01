import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { buildQuoteRequestSubject } from '@/lib/services/quote-requests';

export const dynamic = 'force-dynamic';

type QuoteRequestBody = {
  mode?: 'request' | 'add-services';
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  services?: string[];
  note?: string;
  serviceTypeId?: string;
  serviceAnswers?: Record<string, string | boolean>;
  vendors?: string[];
  location?: {
    id?: string;
    label?: string;
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
};

/** Records a customer "request a quote" / "add services" submission (TASK-023/026). */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: QuoteRequestBody;
  try {
    body = (await request.json()) as QuoteRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const services = (body.services ?? []).filter(Boolean);
  const vendors = (body.vendors ?? []).filter(Boolean);
  const kindLabel = body.mode === 'add-services' ? 'Add services / users' : 'Quote request';
  const locationLine = body.location?.city
    ? `${body.location.city}, ${body.location.state ?? ''}`.trim()
    : '';
  const summary = [
    body.serviceTypeId ? `Service: ${body.serviceTypeId}` : '',
    locationLine ? `Location: ${locationLine}` : '',
    vendors.length ? `Vendors: ${vendors.join(', ')}` : services.join(', '),
    body.note,
  ]
    .filter(Boolean)
    .join(' — ');
  const subject = buildQuoteRequestSubject({
    mode: body.mode ?? 'request',
    company: body.company,
    serviceTypeId: body.serviceTypeId,
    services,
  });

  const { data: quoteRequest, error: insertErr } = await admin
    .from('quote_requests')
    .insert({
      user_id: user.id,
      mode: body.mode ?? 'request',
      contact_name: body.name ?? null,
      company: body.company ?? null,
      contact_email: body.email ?? null,
      contact_phone: body.phone ?? null,
      services,
      note: body.note ?? null,
      service_type_id: body.serviceTypeId ?? null,
      service_answers: body.serviceAnswers ?? null,
      vendor_names: vendors.length ? vendors : null,
      location: body.location ?? null,
      subject,
      status: 'open',
    })
    .select('id')
    .single();

  if (insertErr) {
    console.error('[quote-request] insert failed', insertErr.message);
    return NextResponse.json({ error: 'Could not save quote request' }, { status: 500 });
  }

  // Close the loop for the customer: a "Submitted" notification they can see.
  await admin
    .from('member_notifications')
    .insert({
      user_id: user.id,
      type: 'quote_request',
      title: `${kindLabel} submitted`,
      body: summary
        ? `We received your request (${summary}). A specialist will follow up within 1 business day.`
        : 'We received your request. A specialist will follow up within 1 business day.',
    })
    .then(
      () => undefined,
      () => undefined,
    );

  return NextResponse.json({ ok: true, id: quoteRequest?.id ?? null });
}
