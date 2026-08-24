import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { resolvePortalCustomerForRequest } from '@/lib/portal/member-customer-resolve';

export const dynamic = 'force-dynamic';

/** Quote requests visible to the signed-in portal member (scoped to CRM account when known). */
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const portalCustomer = await resolvePortalCustomerForRequest({
    email: user.email,
    customerExternalId: new URL(request.url).searchParams.get('customerId'),
  });
  const customerExternalId = portalCustomer?.customerExternalId?.trim() || null;
  const scope = new URL(request.url).searchParams.get('scope');

  let query = supabase.from('quote_requests').select('*');

  if (customerExternalId) {
    // Only quotes explicitly linked to this CRM account — never all null-crm rows for a shared admin user_id.
    query = query.eq('crm_customer_id', customerExternalId);
  } else {
    query = query.eq('user_id', user.id);
  }

  if (scope === 'all') {
    query = query.order('created_at', { ascending: false }).limit(100);
  } else {
    query = query
      .not('published_quote_snapshot', 'is', null)
      .order('published_at', { ascending: false });
  }

  const { data, error } = await query;

  if (error) {
    if (error.message.includes('published_quote_snapshot')) {
      return NextResponse.json({ requests: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ requests: data ?? [] });
}
