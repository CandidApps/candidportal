import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('member_review_requests')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ requests: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as {
    accountServiceId?: string;
    analysisReviewId?: string;
    crmCustomerId?: string;
    requestSource?: 'savings_opportunity' | 'my_services';
    serviceName?: string;
    vendorName?: string;
    customerName?: string;
    customerEmail?: string;
    message?: string;
  };

  const message = body.message?.trim();
  const serviceName = body.serviceName?.trim();
  const requestSource = body.requestSource;
  if (!message || !serviceName || !requestSource) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (body.accountServiceId) {
    const { data: existing } = await supabase
      .from('member_review_requests')
      .select('id')
      .eq('user_id', user.id)
      .eq('account_service_id', body.accountServiceId)
      .in('status', ['open', 'in_progress'])
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: 'You already have an open review request for this service.' },
        { status: 409 },
      );
    }
  }

  const subject =
    requestSource === 'savings_opportunity'
      ? `Savings review requested — ${serviceName}`
      : `Service review requested — ${serviceName}`;

  const { data, error } = await supabase
    .from('member_review_requests')
    .insert({
      user_id: user.id,
      account_service_id: body.accountServiceId ?? null,
      analysis_review_id: body.analysisReviewId ?? null,
      crm_customer_id: body.crmCustomerId ?? null,
      request_source: requestSource,
      service_name: serviceName,
      vendor_name: body.vendorName?.trim() || null,
      customer_name: body.customerName?.trim() || null,
      customer_email: body.customerEmail?.trim() || user.email,
      subject,
      message,
      status: 'open',
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ request: data });
}
