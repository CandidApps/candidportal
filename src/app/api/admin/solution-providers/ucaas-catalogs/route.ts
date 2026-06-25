import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { resolveProviderDbId } from '@/lib/solution-providers-db';
import type { UcaasCatalog } from '@/lib/ucaas/types';
import {
  clearDefaultCatalogs,
  getProviderName,
  listProviderCatalogs,
  rowToCatalogRecord,
  setDefaultCatalog,
  type DbUcaasCatalogRow,
} from '@/lib/ucaas/catalogs-server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const providerKey = new URL(request.url).searchParams.get('providerId')?.trim();

  try {
    const admin = createSupabaseAdminClient();

    // No providerId → list catalogs across all UCaaS providers (used by the quote builder).
    if (!providerKey) {
      const { data: providers, error: provErr } = await admin
        .from('solution_providers')
        .select('id, slug, name, display_name')
        .eq('provider_category', 'ucaas');
      if (provErr) throw new Error(provErr.message);

      const all = [];
      for (const p of providers ?? []) {
        const name = (p.display_name as string) || (p.name as string) || 'Provider';
        const catalogs = await listProviderCatalogs(
          admin,
          p.id as number,
          p.slug as string,
          name,
        );
        all.push(...catalogs);
      }
      return NextResponse.json({ catalogs: all });
    }

    const provider = await resolveProviderDbId(admin, providerKey);
    if (!provider) {
      return NextResponse.json({ catalogs: [] });
    }
    const providerName = await getProviderName(admin, provider.id);
    const catalogs = await listProviderCatalogs(admin, provider.id, provider.slug, providerName);
    return NextResponse.json({ catalogs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Load failed';
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
      name?: string;
      catalog?: UcaasCatalog;
      isDefault?: boolean;
    };

    if (!body.providerId?.trim() || !body.name?.trim() || !body.catalog) {
      return NextResponse.json({ error: 'providerId, name, catalog required' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const provider = await resolveProviderDbId(admin, body.providerId);
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }
    const providerName = await getProviderName(admin, provider.id);

    const { count } = await admin
      .from('solution_provider_ucaas_catalogs')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', provider.id);

    const makeDefault = Boolean(body.isDefault) || !count;
    if (makeDefault) await clearDefaultCatalogs(admin, provider.id);

    const { data, error } = await admin
      .from('solution_provider_ucaas_catalogs')
      .insert({
        provider_id: provider.id,
        name: body.name.trim(),
        catalog: body.catalog,
        is_default: makeDefault,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      catalog: rowToCatalogRecord(provider.slug, providerName, data as DbUcaasCatalogRow),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Create failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      catalogId?: string;
      name?: string;
      catalog?: UcaasCatalog;
      isDefault?: boolean;
    };

    if (!body.catalogId?.trim()) {
      return NextResponse.json({ error: 'catalogId required' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: existing, error: loadErr } = await admin
      .from('solution_provider_ucaas_catalogs')
      .select('*, solution_providers!inner(slug)')
      .eq('id', body.catalogId)
      .maybeSingle();

    if (loadErr || !existing) {
      return NextResponse.json({ error: loadErr?.message ?? 'Catalog not found' }, { status: 404 });
    }

    const row = existing as DbUcaasCatalogRow & { solution_providers: { slug: string } };
    const slug = row.solution_providers.slug;
    const providerName = await getProviderName(admin, row.provider_id);
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name?.trim()) payload.name = body.name.trim();
    if (body.catalog) payload.catalog = body.catalog;

    if (body.isDefault) await setDefaultCatalog(admin, row.provider_id, row.id);

    const { data, error } = await admin
      .from('solution_provider_ucaas_catalogs')
      .update(payload)
      .eq('id', body.catalogId)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    let updated = data as DbUcaasCatalogRow;
    if (body.isDefault) updated = { ...updated, is_default: true };
    return NextResponse.json({ catalog: rowToCatalogRecord(slug, providerName, updated) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const catalogId = new URL(request.url).searchParams.get('catalogId')?.trim();
  if (!catalogId) {
    return NextResponse.json({ error: 'catalogId required' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: existing } = await admin
      .from('solution_provider_ucaas_catalogs')
      .select('*')
      .eq('id', catalogId)
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: 'Catalog not found' }, { status: 404 });

    const row = existing as DbUcaasCatalogRow;
    const { error } = await admin
      .from('solution_provider_ucaas_catalogs')
      .delete()
      .eq('id', catalogId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (row.is_default) {
      const { data: next } = await admin
        .from('solution_provider_ucaas_catalogs')
        .select('id')
        .eq('provider_id', row.provider_id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (next) await setDefaultCatalog(admin, row.provider_id, (next as { id: string }).id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
