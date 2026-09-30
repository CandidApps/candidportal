import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { mapDbCampaign, type DbIncentiveCampaign } from '@/lib/incentive-campaigns';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const BUCKET = 'app';
const MAX_BYTES = 5 * 1024 * 1024;
const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

/** Upload (or replace) the optional slide banner image. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: 'Image file is required.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Banner must be 5MB or smaller.' }, { status: 400 });
    }
    const ext = EXT_BY_MIME[file.type];
    if (!ext) {
      return NextResponse.json({ error: 'Use a JPG, PNG, or WebP image.' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: existing, error: loadError } = await admin
      .from('incentive_campaigns')
      .select('banner_image_path')
      .eq('id', id)
      .maybeSingle();
    if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: 'Save the promo first.' }, { status: 404 });

    const storagePath = `promo-banners/${id}-${Date.now()}${ext}`;
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(storagePath);
    const { data, error } = await admin
      .from('incentive_campaigns')
      .update({
        banner_image_path: storagePath,
        banner_image_url: pub.publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      await admin.storage.from(BUCKET).remove([storagePath]);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const oldPath = (existing.banner_image_path as string | null) ?? null;
    if (oldPath && oldPath !== storagePath) await admin.storage.from(BUCKET).remove([oldPath]);

    return NextResponse.json({ campaign: mapDbCampaign(data as DbIncentiveCampaign) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Banner upload failed' },
      { status: 500 },
    );
  }
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
  const { data, error } = await admin
    .from('incentive_campaigns')
    .update({ banner_image_path: null, banner_image_url: null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
  const oldPath = (existing?.banner_image_path as string | null) ?? null;
  if (oldPath) await admin.storage.from(BUCKET).remove([oldPath]);
  return NextResponse.json({ campaign: mapDbCampaign(data as DbIncentiveCampaign) });
}
