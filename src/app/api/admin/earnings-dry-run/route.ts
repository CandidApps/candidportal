import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import type { ProviderCategory } from '@/lib/provider-categories';
import {
  PROVIDER_RATE_PARTNERS,
  parseNetOverrides,
  resolvePartnerSharePct,
  type NetOverridesMap,
} from '@/lib/provider-rate-nets';
import { slugifyProviderName } from '@/lib/solution-providers-db';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const PRODUCT_FIELDS = [
  'sheet_row',
  'provider_slug',
  'category',
  'product_name',
  'gross_rate_pct',
  'intelisys_supported',
  'sandler_supported',
  'telarus_supported',
  'appdirect_supported',
  'appdirect_saas_supported',
  'candid_net_intelisys',
  'candid_net_sandler',
  'candid_net_telarus',
  'candid_net_appdirect_telco',
  'candid_net_appdirect_saas',
  'customer_preview_pct',
  'note',
  'renewal_scope',
  'pays_on_renewals',
  'payment_basis',
  'paid_on_basis',
  'evergreen_strength',
  'first_commission_timing',
  'upfront_summary',
  'exclusions_summary',
  'partner_network',
  'term_length',
  'partner_terms_raw',
  'net_overrides',
] as const;

async function loadPartnerShares(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const { data } = await admin
    .from('partner_suppliers')
    .select('name, display_name, commission_rate');
  const rates: Record<string, number | null> = {};
  for (const row of data ?? []) {
    const rate =
      row.commission_rate != null && Number.isFinite(Number(row.commission_rate))
        ? Number(row.commission_rate)
        : null;
    for (const label of [row.name, row.display_name]) {
      const key = String(label ?? '')
        .trim()
        .toLowerCase();
      if (!key) continue;
      // Prefer first non-null; also index by matcher tokens
      if (rates[key] == null) rates[key] = rate;
      for (const token of ['intelisys', 'sandler', 'telarus', 'appdirect']) {
        if (key.includes(token) && rates[token] == null) rates[token] = rate;
      }
    }
  }
  return PROVIDER_RATE_PARTNERS.map((def) => ({
    key: def.key,
    label: def.label,
    short: def.short,
    sharePct: resolvePartnerSharePct(def, rates),
    defaultSharePct: def.defaultSharePct,
  }));
}

function mapSheetCategory(raw: string | null | undefined): ProviderCategory {
  const c = (raw ?? '').trim().toLowerCase();
  if (c === 'communication') return 'ucaas';
  if (c === 'cloud' || c === 'software') return 'cloud_saas';
  if (c === 'hardware') return 'hardware';
  if (c === 'managed services') return 'managed_it';
  if (c === 'mobility') return 'mobility';
  if (c === 'telco') return 'internet';
  return 'other';
}

async function resolveProviderSlug(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  provider: string,
  providerName: string,
): Promise<string | null> {
  const slug = provider.trim().toLowerCase();
  const name = providerName.trim();
  if (slug) {
    const { data } = await admin
      .from('earnings_dry_run_providers')
      .select('slug')
      .eq('slug', slug)
      .maybeSingle();
    if (data?.slug) return data.slug;
  }
  if (name) {
    const { data: exact } = await admin
      .from('earnings_dry_run_providers')
      .select('slug, name')
      .ilike('name', name)
      .limit(5);
    if (exact?.length === 1) return exact[0].slug;
    const hit = exact?.find((r) => r.name.toLowerCase() === name.toLowerCase());
    if (hit) return hit.slug;

    const { data: fuzzy } = await admin
      .from('earnings_dry_run_providers')
      .select('slug, name')
      .ilike('name', `%${name}%`)
      .limit(10);
    if (fuzzy?.length === 1) return fuzzy[0].slug;
    if (slug && fuzzy?.length) {
      const bySlug = fuzzy.find((r) => r.slug === slug);
      if (bySlug) return bySlug.slug;
    }
  }
  return slug || null;
}

function pickProductPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  for (const key of PRODUCT_FIELDS) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  if (body.net_overrides !== undefined) {
    patch.net_overrides = parseNetOverrides(body.net_overrides);
  }
  return patch;
}

/** Apply partner net fields from overrides map + clear non-overrides to null (compute at read). */
function applyNetFieldsFromOverrides(
  patch: Record<string, unknown>,
  overrides: NetOverridesMap,
) {
  patch.net_overrides = overrides;
  for (const def of PROVIDER_RATE_PARTNERS) {
    const o = overrides[def.key];
    patch[def.netField] = o != null ? o : null;
  }
}

export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim().toLowerCase();
  const category = (searchParams.get('category') ?? '').trim();
  const partner = (searchParams.get('partner') ?? '').trim();
  const limit = Math.min(Number(searchParams.get('limit') ?? 100) || 100, 300);
  const offset = Math.max(Number(searchParams.get('offset') ?? 0) || 0, 0);
  const mode = searchParams.get('mode') ?? 'products';

  const admin = createSupabaseAdminClient();
  const resolvedSlug = await resolveProviderSlug(
    admin,
    searchParams.get('provider') ?? '',
    searchParams.get('providerName') ?? '',
  );

  if (mode === 'summary') {
    let productQuery = admin
      .from('earnings_dry_run_commission_products')
      .select('*', { count: 'exact', head: true });
    if (resolvedSlug) productQuery = productQuery.eq('provider_slug', resolvedSlug);

    const [{ count: providerCount }, { count: productCount }, catsRes] = await Promise.all([
      resolvedSlug
        ? Promise.resolve({ count: 1 })
        : admin.from('earnings_dry_run_providers').select('*', { count: 'exact', head: true }),
      productQuery,
      resolvedSlug
        ? admin
            .from('earnings_dry_run_commission_products')
            .select('category')
            .eq('provider_slug', resolvedSlug)
            .limit(2000)
        : admin.from('earnings_dry_run_commission_products').select('category').limit(5000),
    ]);
    const categories = [
      ...new Set(
        (catsRes.data ?? [])
          .map((r) => String((r as { category?: string }).category ?? ''))
          .filter(Boolean),
      ),
    ].sort();
    const partnerShares = await loadPartnerShares(admin);
    return NextResponse.json({
      dryRun: true,
      providerCount: providerCount ?? 0,
      productCount: productCount ?? 0,
      categories,
      resolvedProviderSlug: resolvedSlug,
      partnerShares,
    });
  }

  if (mode === 'providers') {
    let query = admin
      .from('earnings_dry_run_providers')
      .select('id, slug, name, categories')
      .order('name')
      .range(offset, offset + limit - 1);
    if (q) query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ dryRun: true, providers: data ?? [] });
  }

  let query = admin
    .from('earnings_dry_run_commission_products')
    .select('*', { count: 'exact' })
    .order('provider_slug')
    .order('product_name')
    .range(offset, offset + limit - 1);

  if (resolvedSlug) query = query.eq('provider_slug', resolvedSlug);
  if (q) {
    query = query.or(`product_name.ilike.%${q}%,provider_slug.ilike.%${q}%,note.ilike.%${q}%`);
  }
  if (category) query = query.eq('category', category);
  if (partner === 'intelisys') query = query.eq('intelisys_supported', true);
  if (partner === 'sandler') query = query.eq('sandler_supported', true);
  if (partner === 'telarus') query = query.eq('telarus_supported', true);
  if (partner === 'appdirect') query = query.eq('appdirect_supported', true);
  if (partner === 'appdirect_saas') query = query.eq('appdirect_saas_supported', true);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const partnerShares = await loadPartnerShares(admin);
  return NextResponse.json({
    dryRun: true,
    total: count ?? 0,
    offset,
    limit,
    products: data ?? [],
    resolvedProviderSlug: resolvedSlug,
    partnerShares,
  });
}

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const admin = createSupabaseAdminClient();
  const action = typeof body.action === 'string' ? body.action : 'create_product';

  if (action === 'sync_missing_suppliers') {
    const { data: dryProviders, error: dryErr } = await admin
      .from('earnings_dry_run_providers')
      .select('slug, name, categories');
    if (dryErr) return NextResponse.json({ error: dryErr.message }, { status: 500 });

    const { data: live, error: liveErr } = await admin.from('solution_providers').select('slug');
    if (liveErr) return NextResponse.json({ error: liveErr.message }, { status: 500 });
    const liveSlugs = new Set((live ?? []).map((r) => String(r.slug).toLowerCase()));

    const missing = (dryProviders ?? []).filter((p) => !liveSlugs.has(String(p.slug).toLowerCase()));
    const now = new Date().toISOString();
    let created = 0;
    for (let i = 0; i < missing.length; i += 100) {
      const chunk = missing.slice(i, i + 100).map((p) => {
        const cats = Array.isArray(p.categories) ? p.categories : [];
        const primary = cats[0] ? String(cats[0]) : null;
        return {
          slug: p.slug,
          name: p.name,
          display_name: null,
          notes: `Imported from Suppliers_Final.xlsx Provider Rates (${cats.join(', ') || 'uncategorized'})`,
          provider_category: mapSheetCategory(primary),
          candid_recommended: false,
          include_rates_in_analysis: false,
          created_at: now,
          updated_at: now,
        };
      });
      const { error } = await admin.from('solution_providers').insert(chunk);
      if (error) {
        return NextResponse.json(
          { error: error.message, created, attempted: missing.length },
          { status: 500 },
        );
      }
      created += chunk.length;
    }
    return NextResponse.json({
      ok: true,
      missing: missing.length,
      created,
      message: `Added ${created} suppliers from Provider Rates into Suppliers & Vendors.`,
    });
  }

  // create product
  const providerName =
    typeof body.provider_name === 'string' && body.provider_name.trim()
      ? body.provider_name.trim()
      : '';
  let providerSlug =
    typeof body.provider_slug === 'string' ? body.provider_slug.trim().toLowerCase() : '';
  if (!providerSlug && providerName) providerSlug = slugifyProviderName(providerName);
  const productName = typeof body.product_name === 'string' ? body.product_name.trim() : '';
  if (!providerSlug || !productName) {
    return NextResponse.json({ error: 'provider_slug and product_name are required' }, { status: 400 });
  }

  // ensure dry-run provider row exists
  const { data: existingProv } = await admin
    .from('earnings_dry_run_providers')
    .select('slug')
    .eq('slug', providerSlug)
    .maybeSingle();
  if (!existingProv) {
    const { error: provErr } = await admin.from('earnings_dry_run_providers').insert({
      slug: providerSlug,
      name: providerName || providerSlug,
      categories: body.category ? [String(body.category)] : [],
    });
    if (provErr) return NextResponse.json({ error: provErr.message }, { status: 500 });
  }

  const patch = pickProductPatch(body);
  patch.provider_slug = providerSlug;
  patch.product_name = productName;
  if (patch.sheet_row == null) patch.sheet_row = 0;
  if (patch.partner_terms_raw == null) patch.partner_terms_raw = {};
  if (body.net_overrides !== undefined) {
    applyNetFieldsFromOverrides(patch, parseNetOverrides(body.net_overrides));
  }

  const { data, error } = await admin
    .from('earnings_dry_run_commission_products')
    .insert(patch)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product: data });
}

export async function PATCH(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const id = Number(body.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const patch = pickProductPatch(body);
  delete patch.sheet_row;
  if (body.sheet_row !== undefined) patch.sheet_row = body.sheet_row;
  if (body.net_overrides !== undefined) {
    applyNetFieldsFromOverrides(patch, parseNetOverrides(body.net_overrides));
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('earnings_dry_run_commission_products')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product: data });
}

export async function DELETE(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get('id'));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('earnings_dry_run_commission_products').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
