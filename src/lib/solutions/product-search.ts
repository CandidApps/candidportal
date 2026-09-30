import type { SupabaseClient } from '@supabase/supabase-js';

/** Supplier whose sellable products (Provider Rates catalog) match a search. Names only — never rates. */
export type ProductMatchSupplier = {
  slug: string;
  providerId?: number;
  name: string;
  products: string[];
  matchCount: number;
};

type CatalogRow = { slug: string; providerId?: number; name: string; product: string; haystack: string };

const CACHE_MS = 10 * 60 * 1000;
const APPDIRECT_SLUG = 'appdirect';
let cache: { at: number; rows: CatalogRow[] } | null = null;

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'any', 'are', 'can', 'do', 'does', 'for', 'from', 'get', 'have', 'help', 'how',
  'i', "i'm", 'im', 'in', 'is', 'it', 'looking', 'me', 'my', 'need', 'of', 'on', 'or', 'our', 'please',
  'provider', 'providers', 'sell', 'sells', 'service', 'services', 'solution', 'solutions', 'some',
  'supplier', 'suppliers', 'that', 'the', 'to', 'us', 'vendor', 'vendors', 'want', 'we', 'what', 'who',
  'with', 'you',
]);

const ALIASES: Record<string, string> = {
  m365: 'microsoft 365',
  o365: 'office 365',
  ms365: 'microsoft 365',
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function productSearchTokens(query: string): string[] {
  const expanded = normalize(query)
    .split(' ')
    .map((t) => ALIASES[t] ?? t)
    .join(' ');
  const tokens = expanded
    .split(' ')
    .map((t) => t.replace(/^[.]+|[.]+$/g, ''))
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  return [...new Set(tokens)];
}

async function loadCatalog(admin: SupabaseClient): Promise<CatalogRow[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;

  const [{ data: providers }, { data: solutionProviders }] = await Promise.all([
    admin
      .from('earnings_dry_run_providers')
      .select('slug, name, member_name, customer_facing, merged_into_slug'),
    admin.from('solution_providers').select('id, slug, name, display_name'),
  ]);

  const spBySlug = new Map<string, { id: number; name: string }>();
  for (const sp of (solutionProviders ?? []) as { id: number; slug: string; name: string; display_name: string | null }[]) {
    spBySlug.set(sp.slug, { id: sp.id, name: sp.display_name?.trim() || sp.name });
  }

  type Prov = { slug: string; name: string; member_name: string | null; customer_facing: boolean; merged_into_slug: string | null };
  const provBySlug = new Map<string, Prov>();
  for (const p of (providers ?? []) as Prov[]) provBySlug.set(p.slug, p);

  const resolve = (slug: string): { slug: string; providerId?: number; name: string } | null => {
    let p = provBySlug.get(slug);
    for (let hops = 0; p?.merged_into_slug && hops < 5; hops++) p = provBySlug.get(p.merged_into_slug);
    if (!p || !p.customer_facing) return null;
    const sp = spBySlug.get(p.slug);
    return { slug: p.slug, providerId: sp?.id, name: sp?.name ?? (p.member_name?.trim() || p.name) };
  };

  const rows: CatalogRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from('earnings_dry_run_commission_products')
      .select('provider_slug, product_name, appdirect_saas_supported')
      .eq('hide_from_member_view', false)
      .order('id')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    for (const r of (data ?? []) as { provider_slug: string; product_name: string; appdirect_saas_supported: boolean | null }[]) {
      const owner = resolve(r.provider_slug);
      if (!owner || !r.product_name?.trim()) continue;
      const product = r.product_name.trim();
      const haystack = ` ${normalize(product)} ${normalize(owner.name)} `;
      rows.push({ ...owner, product, haystack });
      // Products sold through the AppDirect SaaS marketplace are also offered by AppDirect itself.
      const marketplace = r.appdirect_saas_supported ? resolve(APPDIRECT_SLUG) : null;
      if (marketplace && marketplace.slug !== owner.slug) rows.push({ ...marketplace, product, haystack });
    }
    if (!data || data.length < pageSize) break;
  }

  cache = { at: Date.now(), rows };
  return rows;
}

function clip(s: string): string {
  return s.length > 70 ? `${s.slice(0, 67).trimEnd()}…` : s;
}

/** Product name without its parenthetical detail — unless the match is only inside the parentheses. */
function displayProductName(name: string, tokens: string[]): string {
  const hits = (s: string) => tokens.some((t) => ` ${normalize(s)} `.includes(` ${t}`));
  const paren = name.indexOf('(');
  const head = (paren > 0 ? name.slice(0, paren) : name).trim() || name;
  if (paren < 0 || hits(head)) return clip(head);
  const part = name
    .slice(paren + 1)
    .replace(/\)+\s*$/, '')
    .split(/\s*(?:,|;|&|\(|\))\s*/)
    .find((p) => p && hits(p));
  const detail = part?.trim();
  if (!detail) return clip(head);
  return clip(/^(for|with|on|in|via|incl\.?|including)\b/i.test(detail) ? `${head} ${detail}` : detail);
}

/** Suppliers whose sellable products match the query, best matches first. */
export async function searchSupplierProducts(
  admin: SupabaseClient,
  query: string,
  opts: { limit?: number; productsPerSupplier?: number } = {},
): Promise<ProductMatchSupplier[]> {
  const tokens = productSearchTokens(query);
  if (!tokens.length) return [];
  const rows = await loadCatalog(admin);

  // Short queries need every word; longer (chat-style) queries need most of them.
  const required = tokens.length <= 3 ? tokens.length : Math.ceil(tokens.length * 0.6);
  const bySlug = new Map<string, ProductMatchSupplier & { best: number; candidates: Map<string, number> }>();

  for (const row of rows) {
    let score = 0;
    for (const t of tokens) {
      if (row.haystack.includes(` ${t}`)) score++;
    }
    if (score < required) continue;
    // A supplier-name-only hit doesn't count as a product match.
    if (!tokens.some((t) => ` ${normalize(row.product)} `.includes(` ${t}`))) continue;
    const entry = bySlug.get(row.slug) ?? {
      slug: row.slug,
      providerId: row.providerId,
      name: row.name,
      products: [],
      matchCount: 0,
      best: 0,
      candidates: new Map<string, number>(),
    };
    entry.matchCount++;
    entry.best = Math.max(entry.best, score);
    const short = displayProductName(row.product, tokens);
    // Prefer names that contain the whole query, then shorter (more specific) names.
    const shortNorm = ` ${normalize(short)} `;
    const rank = tokens.filter((t) => shortNorm.includes(` ${t}`)).length * 1000 - short.length;
    if (!entry.candidates.has(short) || entry.candidates.get(short)! < rank) entry.candidates.set(short, rank);
    bySlug.set(row.slug, entry);
  }

  const perSupplier = opts.productsPerSupplier ?? 4;
  return [...bySlug.values()]
    .sort((a, b) => b.best - a.best || b.matchCount - a.matchCount || a.name.localeCompare(b.name))
    .slice(0, opts.limit ?? 40)
    .map(({ best: _best, candidates, ...rest }) => ({
      ...rest,
      products: [...candidates.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, perSupplier)
        .map(([name]) => name),
    }));
}

