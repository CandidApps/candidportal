import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { insertQuoteRequest, buildQuoteRequestSubject, serviceTypeLabel, inferQuoteServiceTypeId } from '@/lib/services/quote-requests';
import { createQuoteRequestSubmittedMessage } from '@/lib/services/quote-notifications';

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
  const serviceTypeId = inferQuoteServiceTypeId(body.serviceTypeId, services);
  const kindLabel = body.mode === 'add-services' ? 'Add services / users' : 'Quote request';
  const locationLine = body.location?.city
    ? `${body.location.city}, ${body.location.state ?? ''}`.trim()
    : '';
  const summary = [
    serviceTypeId ? `Service: ${serviceTypeLabel(serviceTypeId)}` : '',
    locationLine ? `Location: ${locationLine}` : '',
    vendors.length ? `Vendors: ${vendors.join(', ')}` : services.join(', '),
    body.note,
  ]
    .filter(Boolean)
    .join(' — ');

  const { id: quoteRequestId, error: insertErr } = await insertQuoteRequest(admin, {
    userId: user.id,
    mode: body.mode ?? 'request',
    name: body.name ?? null,
    company: body.company ?? null,
    email: body.email ?? null,
    phone: body.phone ?? null,
    services,
    note: body.note ?? null,
    serviceTypeId: body.serviceTypeId ?? null,
    serviceAnswers: body.serviceAnswers ?? null,
    vendors,
    location: body.location ?? null,
  });

  if (insertErr || !quoteRequestId) {
    console.error('[quote-request] insert failed', insertErr);
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
      quote_request_id: quoteRequestId,
    })
    .then(
      () => undefined,
      () => undefined,
    );

  const threadSubject = buildQuoteRequestSubject({
    mode: body.mode ?? 'request',
    company: body.company,
    serviceTypeId,
    services,
  });

  await createQuoteRequestSubmittedMessage({
    userId: user.id,
    quoteRequestId,
    serviceTypeId,
    subject: threadSubject,
  });

  return NextResponse.json({ ok: true, id: quoteRequestId });
}
