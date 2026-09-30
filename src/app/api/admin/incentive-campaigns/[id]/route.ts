import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import {
  campaignPersistFields,
  mapDbCampaign,
  type CampaignInput,
  type DbIncentiveCampaign,
} from '@/lib/incentive-campaigns';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const BUCKET = 'app';

type PatchBody = CampaignInput & { action?: 'end_early' | 'reopen' };

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as PatchBody;
  const now = new Date().toISOString();

  let update: Record<string, unknown>;
  if (body.action === 'end_early') {
    update = { ended_early_at: now, show_in_slider: false };
  } else if (body.action === 'reopen') {
    update = { ended_early_at: null };
  } else {
    const parsed = campaignPersistFields(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    update = parsed.fields;
    const providerDbId = Number(body.providerDbId);
    if (Number.isFinite(providerDbId) && providerDbId > 0) update.provider_id = providerDbId;
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('incentive_campaigns')
    .update({ ...update, updated_at: now })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
  return NextResponse.json({ campaign: mapDbCampaign(data as DbIncentiveCampaign) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from('incentive_campaigns')
    .select('banner_image_path')
    .eq('id', id)
    .maybeSingle();
  const { error } = await admin.from('incentive_campaigns').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const oldPath = (existing?.banner_image_path as string | null) ?? null;
  if (oldPath) await admin.storage.from(BUCKET).remove([oldPath]);
  return NextResponse.json({ ok: true });
}
