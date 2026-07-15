import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { providerCategoryToSolution, type CatalogSupplier } from '@/lib/solutions/catalog';
import { normalizeTagList } from '@/lib/solutions/find-solutions-tags';
import type {
  DbSolutionProvider,
  DbSolutionProviderSolution,
} from '@/lib/solution-providers-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Members only need to be authenticated; we expose a safe subset of supplier data.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ suppliers: [] });

  try {
    const admin = createSupabaseAdminClient();
    const [providersRes, solutionsRes] = await Promise.all([
      admin
        .from('solution_providers')
        .select(
          'id, name, display_name, website, provider_category, description, candid_recommended, find_capabilities, find_services, logo_url',
        )
        .order('name'),
      admin.from('solution_provider_solutions').select('id, provider_id, name, description'),
    ]);

    if (providersRes.error) throw new Error(providersRes.error.message);

    const providers = (providersRes.data ?? []) as Array<
      Pick<
        DbSolutionProvider,
        | 'id'
        | 'name'
        | 'display_name'
        | 'website'
        | 'provider_category'
        | 'description'
        | 'candid_recommended'
        | 'find_capabilities'
        | 'find_services'
        | 'logo_url'
      >
    >;
    const solutions = (solutionsRes.data ?? []) as Pick<
      DbSolutionProviderSolution,
      'id' | 'provider_id' | 'name' | 'description'
    >[];

    const solByProvider = new Map<number, DbSolutionProviderSolution[]>();
    for (const s of solutions) {
      const list = solByProvider.get(s.provider_id) ?? [];
      list.push(s as DbSolutionProviderSolution);
      solByProvider.set(s.provider_id, list);
    }

    const suppliers: CatalogSupplier[] = providers.map((p) => {
      const sols = solByProvider.get(p.id) ?? [];
      const adminCapabilities = normalizeTagList(p.find_capabilities);
      const adminServices = normalizeTagList(p.find_services);
      const solutionFeatures = sols
        .map((s) => s.name?.trim())
        .filter((n): n is string => Boolean(n))
        .slice(0, 6);
      const features =
        adminCapabilities.length > 0
          ? adminCapabilities
          : solutionFeatures.length
            ? solutionFeatures
            : ['In Candid’s active supplier network'];
      return {
        name: p.display_name?.trim() || p.name,
        website: p.website ?? undefined,
        categories: [providerCategoryToSolution(p.provider_category)],
        features,
        capabilities: adminCapabilities,
        services: adminServices,
        description: p.description?.trim() || undefined,
        candidRecommended: Boolean(p.candid_recommended),
        logoUrl: p.logo_url ?? undefined,
        source: 'candid',
      };
    });

    return NextResponse.json({ suppliers });
  } catch {
    return NextResponse.json({ suppliers: [] });
  }
}
