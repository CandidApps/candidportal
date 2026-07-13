import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { resolvePortalCustomerForRequest } from '@/lib/portal/member-customer-resolve';
import { listPendingContractsForCustomer } from '@/lib/services/member-pending-contracts';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const ctx = await resolvePortalCustomerForRequest({
    email: user.email,
    customerExternalId: url.searchParams.get('customerId'),
  });
  if (!ctx) {
    return NextResponse.json({ contracts: [] });
  }

  const contracts = await listPendingContractsForCustomer(ctx);
  return NextResponse.json({ contracts });
}
