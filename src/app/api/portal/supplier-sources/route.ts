import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { mapSourceRow, type DbSourceWithProvider } from '@/lib/supplier-sources-db';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const SOURCE_SELECT = `
  id, provider_id, title, url, source_type, visible_in_portal, sort_order, created_at, updated_at,
  solution_providers ( id, slug, name, display_name )
`;

function normalizeVendor(v: string): string {
  return v.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const vendorsRaw = searchParams.get('vendors')?.trim() ?? '';
    const vendorTokens = vendorsRaw
      .split(',')
      .map(normalizeVendor)
      .filter(Boolean);

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from('solution_provider_sources')
      .select(SOURCE_SELECT)
      .eq('visible_in_portal', true)
      .order('sort_order')
      .order('title');

    if (error) throw new Error(error.message);

    const all = ((data ?? []) as unknown as DbSourceWithProvider[]).map(mapSourceRow);
    if (!vendorTokens.length) {
      return NextResponse.json({ sources: all });
    }

    const sources = all.filter((s) => {
      const name = normalizeVendor(s.providerName);
      const slug = normalizeVendor(s.providerId.replace(/-/g, ' '));
      return vendorTokens.some(
        (v) => name.includes(v) || v.includes(name) || slug.includes(v) || v.includes(slug),
      );
    });

    return NextResponse.json({ sources });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load sources';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
