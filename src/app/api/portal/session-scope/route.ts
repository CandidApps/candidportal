import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { resolveMemberPortalCustomer } from '@/lib/portal/member-customer-resolve';
import type { PortalAccessTier } from '@/lib/portal-access';

/** Resolve member portal scope from CRM (not localStorage grants). */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ctx = await resolveMemberPortalCustomer(user.email, { requirePortalAccess: true });
  if (!ctx) {
    return NextResponse.json({ scope: null });
  }

  const tier: PortalAccessTier =
    ctx.portalAccessTier === 'full' ? 'full' : 'trial';

  return NextResponse.json({
    scope: {
      customerId: ctx.customerExternalId,
      companyName: ctx.companyName,
      contactId: ctx.contactExternalId,
      contactName: ctx.contactName,
      contactEmail: ctx.contactEmail,
      tier,
      locationIds: ctx.locationIds,
    },
  });
}
