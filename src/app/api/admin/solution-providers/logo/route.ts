import path from 'path';
import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { slugifyProviderName } from '@/lib/solution-providers-db';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const BUCKET = 'app';
const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon']);

function extForMime(mime: string, filename: string): string {
  const fromName = path.extname(filename).toLowerCase();
  if (fromName && ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico'].includes(fromName)) {
    return fromName === '.jpeg' ? '.jpg' : fromName;
  }
  switch (mime) {
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/svg+xml':
      return '.svg';
    case 'image/x-icon':
      return '.ico';
    default:
      return '.jpg';
  }
}

async function resolveProviderId(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  opts: { providerDbId?: number | null; providerSlug?: string | null; providerName?: string | null },
): Promise<{ id: number; slug: string } | null> {
  if (opts.providerDbId) {
    const { data } = await admin
      .from('solution_providers')
      .select('id, slug')
      .eq('id', opts.providerDbId)
      .maybeSingle();
    if (data?.id) return { id: data.id as number, slug: String(data.slug) };
  }
  const slug = slugifyProviderName(opts.providerSlug || opts.providerName || '');
  if (!slug) return null;
  const { data } = await admin
    .from('solution_providers')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (data?.id) return { id: data.id as number, slug: String(data.slug) };
  return null;
}

/** Upload (or replace) a custom supplier logo. */
export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get('file');
    const providerDbIdRaw = String(form.get('providerDbId') ?? '').trim();
    const providerSlug = String(form.get('providerSlug') ?? '').trim();
    const providerName = String(form.get('providerName') ?? '').trim();

    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: 'Image file is required.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Logo must be 2MB or smaller.' }, { status: 400 });
    }
    const mime = file.type || 'application/octet-stream';
    if (!ALLOWED.has(mime)) {
      return NextResponse.json(
        { error: 'Use a PNG, JPG, WebP, SVG, or ICO image.' },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdminClient();
    const provider = await resolveProviderId(admin, {
      providerDbId: providerDbIdRaw ? Number(providerDbIdRaw) : null,
      providerSlug,
      providerName,
    });
    if (!provider) {
      return NextResponse.json(
        { error: 'Save the supplier first, then upload a logo.' },
        { status: 400 },
      );
    }

    const { data: existing } = await admin
      .from('solution_providers')
      .select('logo_storage_path')
      .eq('id', provider.id)
      .maybeSingle();

    const ext = extForMime(mime, file.name);
    const storagePath = `supplier-logos/${provider.slug}-${Date.now()}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType: mime,
      upsert: false,
    });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(storagePath);
    const logoUrl = pub.publicUrl;
    const now = new Date().toISOString();
    const { error: updateError } = await admin
      .from('solution_providers')
      .update({
        logo_url: logoUrl,
        logo_storage_path: storagePath,
        updated_at: now,
      })
      .eq('id', provider.id);

    if (updateError) {
      await admin.storage.from(BUCKET).remove([storagePath]);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const oldPath = (existing?.logo_storage_path as string | null) ?? null;
    if (oldPath && oldPath !== storagePath) {
      await admin.storage.from(BUCKET).remove([oldPath]);
    }

    return NextResponse.json({
      logoUrl,
      logoStoragePath: storagePath,
      providerDbId: provider.id,
      providerSlug: provider.slug,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Logo upload failed' },
      { status: 500 },
    );
  }
}

/** Remove a custom supplier logo (falls back to website favicon). */
export async function DELETE(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      providerDbId?: number;
      providerSlug?: string;
      providerName?: string;
    };
    const admin = createSupabaseAdminClient();
    const provider = await resolveProviderId(admin, {
      providerDbId: body.providerDbId ?? null,
      providerSlug: body.providerSlug ?? null,
      providerName: body.providerName ?? null,
    });
    if (!provider) {
      return NextResponse.json({ error: 'Supplier not found.' }, { status: 404 });
    }

    const { data: existing } = await admin
      .from('solution_providers')
      .select('logo_storage_path')
      .eq('id', provider.id)
      .maybeSingle();

    const { error } = await admin
      .from('solution_providers')
      .update({
        logo_url: null,
        logo_storage_path: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', provider.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const oldPath = (existing?.logo_storage_path as string | null) ?? null;
    if (oldPath) await admin.storage.from(BUCKET).remove([oldPath]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to remove logo' },
      { status: 500 },
    );
  }
}
