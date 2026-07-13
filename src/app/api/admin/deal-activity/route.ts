import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { mapDealActivityEventRow } from '@/lib/services/deal-activity';

export const dynamic = 'force-dynamic';

/** GET ?leadId= | ?customerExternalId= | ?actionId= */
export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get('leadId')?.trim();
  const customerExternalId = searchParams.get('customerExternalId')?.trim();
  const actionId = searchParams.get('actionId')?.trim();

  if (!leadId && !customerExternalId && !actionId) {
    return NextResponse.json(
      { error: 'leadId, customerExternalId, or actionId required' },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();
  let query = admin
    .from('deal_activity_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (leadId) query = query.eq('lead_id', leadId);
  else if (actionId) query = query.eq('contract_submit_action_id', actionId);
  else if (customerExternalId) query = query.eq('crm_customer_external_id', customerExternalId);

  const { data, error } = await query;
  if (error) {
    if (/deal_activity_events/.test(error.message)) {
      return NextResponse.json({ events: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    events: (data ?? []).map((r) => mapDealActivityEventRow(r as Record<string, unknown>)),
  });
}
