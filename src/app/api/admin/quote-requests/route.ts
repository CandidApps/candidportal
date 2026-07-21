import { NextResponse } from 'next/server';
import type { Customer } from '@/components/CustomersView';
import type { Lead } from '@/components/LeadsView';
import { getMyRole } from '@/lib/auth/roles';
import { createAdminInitiatedQuoteRequest } from '@/lib/services/admin-initiated-quote-request';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Admin list of customer quote requests (service role — works before migration 0053 RLS). */
export async function GET() {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('quote_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ requests: data ?? [] });
}

type AdminCreateQuoteBody = {
  source?: 'account' | 'lead';
  customerExternalId?: string;
  portalLeadRowId?: string;
  leadId?: string;
  mode?: 'request' | 'add-services';
  customerSnapshot?: Customer;
  leadSnapshot?: Lead;
};

/** Admin: start a quote request from an account or lead (Action Center workflow). */
export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: AdminCreateQuoteBody;
  try {
    body = (await request.json()) as AdminCreateQuoteBody;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const source = body.source;
  if (source !== 'account' && source !== 'lead') {
    return NextResponse.json({ error: 'source must be account or lead' }, { status: 400 });
  }

  try {
    const { quoteRequestId } = await createAdminInitiatedQuoteRequest({
      source,
      customerExternalId: body.customerExternalId,
      portalLeadRowId: body.portalLeadRowId,
      leadId: body.leadId,
      mode: body.mode,
      customerSnapshot: body.customerSnapshot,
      leadSnapshot: body.leadSnapshot,
      initiatedByUserId: user.id,
    });
    return NextResponse.json({ ok: true, quoteRequestId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create quote request';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
