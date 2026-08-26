import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { resolvePortalCustomerForRequest } from '@/lib/portal/member-customer-resolve';
import {
  fetchQuoteRequestsForPortalCustomer,
  repairMisassignedQuoteRequestOwners,
  repairQuoteRequestLinksForCustomer,
} from '@/lib/services/quote-request-crm-link';

export const dynamic = 'force-dynamic';

/** Quote requests visible to the signed-in portal member (scoped to CRM account when known). */
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const portalCustomer = await resolvePortalCustomerForRequest({
    email: user.email,
    customerExternalId: url.searchParams.get('customerId'),
  });
  const customerExternalId = portalCustomer?.customerExternalId?.trim() || null;
  const scope = url.searchParams.get('scope');

  const admin = createSupabaseAdminClient();

  try {
    if (customerExternalId) {
      await repairQuoteRequestLinksForCustomer(admin, customerExternalId).catch(() => undefined);
      await repairMisassignedQuoteRequestOwners(admin, {
        customerExternalId,
      }).catch(() => undefined);
      const requests = await fetchQuoteRequestsForPortalCustomer(admin, customerExternalId, {
        scope: scope === 'all' ? 'all' : 'published',
      });
      return NextResponse.json({ requests });
    }

    let query = admin.from('quote_requests').select('*').eq('user_id', user.id);

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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load quotes';
    if (message.includes('published_quote_snapshot')) {
      return NextResponse.json({ requests: [] });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
