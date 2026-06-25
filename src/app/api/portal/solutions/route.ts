import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { providerCategoryToSolution, type CatalogSupplier } from '@/lib/solutions/catalog';
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
      admin.from('solution_providers').select('id, name, display_name, website, provider_category').order('name'),
      admin.from('solution_provider_solutions').select('id, provider_id, name, description'),
    ]);

    if (providersRes.error) throw new Error(providersRes.error.message);

    const providers = (providersRes.data ?? []) as Pick<
      DbSolutionProvider,
      'id' | 'name' | 'display_name' | 'website' | 'provider_category'
    >[];
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
      const features = sols
        .map((s) => s.name?.trim())
        .filter((n): n is string => Boolean(n))
        .slice(0, 4);
      return {
        name: p.display_name?.trim() || p.name,
        website: p.website ?? undefined,
        categories: [providerCategoryToSolution(p.provider_category)],
        features: features.length ? features : ['In Candid’s active supplier network'],
        source: 'candid',
      };
    });

    return NextResponse.json({ suppliers });
  } catch {
    return NextResponse.json({ suppliers: [] });
  }
}
