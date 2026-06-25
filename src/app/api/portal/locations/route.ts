import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { resolveMemberPortalCustomer } from '@/lib/portal/member-customer-resolve';
import type { Location } from '@/components/CustomersView';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ctx = await resolveMemberPortalCustomer(user.email);
  if (!ctx) {
    return NextResponse.json({ locations: [], hasMasterAccess: false });
  }

  const admin = createSupabaseAdminClient();
  const { data: locRows, error } = await admin
    .from('customer_locations')
    .select('*')
    .eq('customer_id', ctx.customerUuid)
    .order('is_primary', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const locations: Location[] = (locRows ?? []).map((l) => ({
    id: l.external_id as string,
    label: l.label as string,
    street: l.street as string,
    city: l.city as string,
    state: l.state as string,
    zip: l.zip as string,
    isPrimary: Boolean(l.is_primary),
  }));
  const primaryId = locations.find((l) => l.isPrimary)?.id ?? locations[0]?.id;
  const hasMasterAccess =
    ctx.isPrimaryContact ||
    !ctx.locationIds.length ||
    (primaryId != null &&
      ctx.locationIds.length === 1 &&
      ctx.locationIds[0] === primaryId);

  return NextResponse.json({
    locations,
    primaryLocationId: primaryId ?? null,
    scopedLocationIds: ctx.locationIds,
    hasMasterAccess,
    contactName: ctx.contactName,
    companyName: ctx.companyName,
  });
}
