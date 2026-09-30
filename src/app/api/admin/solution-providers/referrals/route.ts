import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export type AdminReferralClick = {
  id: string;
  trackingId: string;
  clickedAt: string;
  response: 'signed_up' | 'not_yet' | 'no' | null;
  respondedAt: string | null;
  dealExternalId: string | null;
  customerName: string | null;
  customerExternalId: string | null;
};

/** GET ?providerId=123 — referral clicks and member answers for one supplier. */
export async function GET(req: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const providerId = Number(new URL(req.url).searchParams.get('providerId'));
  if (!Number.isInteger(providerId) || providerId <= 0) {
    return NextResponse.json({ error: 'providerId is required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('member_referral_clicks')
    .select('id, tracking_id, clicked_at, response, responded_at, deal_external_id, customers(company, external_id)')
    .eq('provider_id', providerId)
    .order('clicked_at', { ascending: false })
    .limit(200);
  if (error) {
    if (/member_referral_clicks/.test(error.message)) return NextResponse.json({ clicks: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Row = {
    id: string;
    tracking_id: string;
    clicked_at: string;
    response: AdminReferralClick['response'];
    responded_at: string | null;
    deal_external_id: string | null;
    customers: { company: string | null; external_id: string | null } | null;
  };
  const clicks: AdminReferralClick[] = ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    trackingId: r.tracking_id,
    clickedAt: r.clicked_at,
    response: r.response,
    respondedAt: r.responded_at,
    dealExternalId: r.deal_external_id,
    customerName: r.customers?.company ?? null,
    customerExternalId: r.customers?.external_id ?? null,
  }));
  return NextResponse.json({ clicks });
}
