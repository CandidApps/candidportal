import { NextResponse } from 'next/server';
import { resolvePortalCustomerForRequest } from '@/lib/portal/member-customer-resolve';
import {
  listPendingReferralFollowUps,
  listReferralLocations,
  respondToReferral,
  type ReferralLocation,
  type ReferralResponse,
} from '@/lib/services/member-referrals';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const RESPONSES: ReferralResponse[] = ['signed_up', 'not_yet', 'no'];

async function sessionUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Pending "Did you sign up?" follow-ups for the signed-in member, plus their account locations. */
export async function GET() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ followUps: [], locations: [] }, { status: 401 });
  try {
    const admin = createSupabaseAdminClient();
    const followUps = await listPendingReferralFollowUps(admin, user.id);
    let locations: ReferralLocation[] = [];
    if (followUps.length > 0) {
      const ctx = await resolvePortalCustomerForRequest({ email: user.email });
      if (ctx) locations = await listReferralLocations(admin, ctx.customerUuid);
    }
    return NextResponse.json({ followUps, locations });
  } catch (err) {
    return NextResponse.json(
      { followUps: [], locations: [], error: err instanceof Error ? err.message : 'Failed to load referrals' },
      { status: 500 },
    );
  }
}

/** Body: { clickId, response: 'signed_up' | 'not_yet' | 'no', locationId? } */
export async function POST(req: Request) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { clickId?: unknown; response?: unknown; locationId?: unknown }
    | null;
  const clickId = typeof body?.clickId === 'string' ? body.clickId : '';
  const response = RESPONSES.find((r) => r === body?.response);
  const requestedLocation = typeof body?.locationId === 'string' ? body.locationId.trim() : '';
  if (!clickId || !response) {
    return NextResponse.json({ error: 'clickId and a valid response are required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  try {
    let customer = null;
    if (response === 'signed_up') {
      const ctx = await resolvePortalCustomerForRequest({ email: user.email });
      if (ctx) {
        const locations = await listReferralLocations(admin, ctx.customerUuid);
        if (locations.length > 1 && !requestedLocation) {
          return NextResponse.json({ error: 'Choose which location this is for' }, { status: 400 });
        }
        const chosen = requestedLocation ? locations.find((l) => l.id === requestedLocation) : locations[0];
        if (requestedLocation && !chosen) {
          return NextResponse.json({ error: 'That location is not on your account' }, { status: 400 });
        }
        customer = {
          customerUuid: ctx.customerUuid,
          customerExternalId: ctx.customerExternalId,
          contactName: ctx.contactName || null,
          contactEmail: ctx.contactEmail || user.email || null,
          primaryLocationId: chosen?.id ?? ctx.locationIds[0] ?? '',
        };
      }
    }
    const result = await respondToReferral(admin, { userId: user.id, clickId, response, customer });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save response' },
      { status: 500 },
    );
  }
}
