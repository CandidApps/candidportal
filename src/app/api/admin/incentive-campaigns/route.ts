import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import {
  campaignPersistFields,
  isCampaignSource,
  mapDbCampaign,
  type CampaignInput,
  type DbIncentiveCampaign,
} from '@/lib/incentive-campaigns';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const providerDbId = Number(new URL(request.url).searchParams.get('providerDbId') ?? '');
  const admin = createSupabaseAdminClient();
  let query = admin
    .from('incentive_campaigns')
    .select('*')
    .order('slide_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (Number.isFinite(providerDbId) && providerDbId > 0) query = query.eq('provider_id', providerDbId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    campaigns: ((data ?? []) as DbIncentiveCampaign[]).map(mapDbCampaign),
  });
}

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as CampaignInput;
  if (!isCampaignSource(body.source)) {
    return NextResponse.json({ error: 'Choose Candid promo or Supplier SPIFF.' }, { status: 400 });
  }
  const providerDbId = Number(body.providerDbId);
  if (!Number.isFinite(providerDbId) || providerDbId <= 0) {
    return NextResponse.json({ error: 'Choose a supplier.' }, { status: 400 });
  }
  const parsed = campaignPersistFields(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('incentive_campaigns')
    .insert({
      ...parsed.fields,
      provider_id: providerDbId,
      source: body.source,
      created_by: user?.id ?? null,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: mapDbCampaign(data as DbIncentiveCampaign) });
}
