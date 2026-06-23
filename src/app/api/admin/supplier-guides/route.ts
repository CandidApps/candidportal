import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import type { SupplierGuideCategory } from '@/lib/supplier-guides-types';
import {
  guideIdFromDb,
  mapGuideRow,
  parseGuideDbId,
  type DbGuideWithProvider,
} from '@/lib/supplier-guides-db';
import { slugifyProviderName } from '@/lib/solution-providers-db';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const GUIDE_SELECT = `
  id, provider_id, title, content, category, visible_in_portal, sort_order, created_at, updated_at,
  solution_providers ( id, slug, name, display_name )
`;

async function resolveProviderDbId(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  providerId: string,
): Promise<number | null> {
  const slug = slugifyProviderName(providerId);
  const trimmed = providerId.trim();

  const { data: bySlug, error: slugErr } = await admin
    .from('solution_providers')
    .select('id, slug, name')
    .eq('slug', slug)
    .maybeSingle();
  if (slugErr) throw new Error(slugErr.message);
  if (bySlug?.id) return bySlug.id as number;

  if (trimmed !== slug) {
    const { data: byRawSlug } = await admin
      .from('solution_providers')
      .select('id')
      .eq('slug', trimmed)
      .maybeSingle();
    if (byRawSlug?.id) return byRawSlug.id as number;
  }

  const { data: byName, error: nameErr } = await admin
    .from('solution_providers')
    .select('id')
    .ilike('name', trimmed)
    .maybeSingle();
  if (nameErr) throw new Error(nameErr.message);
  if (byName?.id) return byName.id as number;

  const { data: allProviders, error: allErr } = await admin
    .from('solution_providers')
    .select('id, slug, name');
  if (allErr) throw new Error(allErr.message);

  const key = trimmed.toLowerCase();
  const fuzzy = (allProviders ?? []).find((p) => {
    const name = String(p.name ?? '').toLowerCase();
    const s = String(p.slug ?? '').toLowerCase();
    return name === key || s === key || name.includes(key) || key.includes(name);
  });
  return fuzzy?.id ? (fuzzy.id as number) : null;
}

async function loadGuides(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  providerSlug?: string,
): Promise<ReturnType<typeof mapGuideRow>[]> {
  let query = admin
    .from('solution_provider_guides')
    .select(GUIDE_SELECT)
    .order('sort_order')
    .order('title');

  if (providerSlug) {
    const providerDbId = await resolveProviderDbId(admin, providerSlug);
    if (!providerDbId) return [];
    query = query.eq('provider_id', providerDbId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as DbGuideWithProvider[]).map(mapGuideRow);
}

export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get('providerId')?.trim() || undefined;
    const admin = createSupabaseAdminClient();
    const guides = await loadGuides(admin, providerId);
    return NextResponse.json({ guides });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load guides';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      providerId?: string;
      title?: string;
      content?: string;
      category?: SupplierGuideCategory;
      visibleInPortal?: boolean;
      sortOrder?: number;
    };

    if (!body.providerId?.trim() || !body.title?.trim()) {
      return NextResponse.json({ error: 'providerId and title required' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const providerDbId = await resolveProviderDbId(admin, body.providerId);
    if (!providerDbId) {
      return NextResponse.json({ error: 'Provider not found in database. Save the provider first.' }, { status: 404 });
    }

    const { data, error } = await admin
      .from('solution_provider_guides')
      .insert({
        provider_id: providerDbId,
        title: body.title.trim(),
        content: body.content?.trim() ?? '',
        category: body.category ?? 'guide',
        visible_in_portal: Boolean(body.visibleInPortal),
        sort_order: body.sortOrder ?? 0,
      })
      .select(GUIDE_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ guide: mapGuideRow(data as unknown as DbGuideWithProvider) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create guide';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      id?: string;
      title?: string;
      content?: string;
      category?: SupplierGuideCategory;
      visibleInPortal?: boolean;
      sortOrder?: number;
    };

    const dbId = body.id ? parseGuideDbId(body.id) : null;
    if (!dbId) {
      return NextResponse.json({ error: 'Valid guide id required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.title !== undefined) updates.title = body.title.trim();
    if (body.content !== undefined) updates.content = body.content.trim();
    if (body.category !== undefined) updates.category = body.category;
    if (body.visibleInPortal !== undefined) updates.visible_in_portal = body.visibleInPortal;
    if (body.sortOrder !== undefined) updates.sort_order = body.sortOrder;

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from('solution_provider_guides')
      .update(updates)
      .eq('id', dbId)
      .select(GUIDE_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ guide: mapGuideRow(data as unknown as DbGuideWithProvider) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update guide';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id')?.trim();
    const dbId = id ? parseGuideDbId(id) : null;
    if (!dbId) {
      return NextResponse.json({ error: 'Valid guide id required' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { error } = await admin.from('solution_provider_guides').delete().eq('id', dbId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete guide';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
