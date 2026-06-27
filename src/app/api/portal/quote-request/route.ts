import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type QuoteRequestBody = {
  mode?: 'request' | 'add-services';
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  services?: string[];
  note?: string;
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
  const kindLabel = body.mode === 'add-services' ? 'Add services / users' : 'Quote request';
  const summary = [services.join(', '), body.note].filter(Boolean).join(' — ');

  // Best-effort: persist to a quote_requests table if present.
  await admin
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
      status: 'submitted',
    })
    .then(
      () => undefined,
      () => undefined,
    );

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

  return NextResponse.json({ ok: true });
}
