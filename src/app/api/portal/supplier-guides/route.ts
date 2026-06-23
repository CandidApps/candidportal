import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { mapGuideRow, type DbGuideWithProvider } from '@/lib/supplier-guides-db';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const GUIDE_SELECT = `
  id, provider_id, title, content, category, visible_in_portal, sort_order, created_at, updated_at,
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
      .from('solution_provider_guides')
      .select(GUIDE_SELECT)
      .eq('visible_in_portal', true)
      .order('sort_order')
      .order('title');

    if (error) throw new Error(error.message);

    const all = ((data ?? []) as unknown as DbGuideWithProvider[]).map(mapGuideRow);
    if (!vendorTokens.length) {
      return NextResponse.json({ guides: all });
    }

    const guides = all.filter((g) => {
      const name = normalizeVendor(g.providerName);
      const slug = normalizeVendor(g.providerId.replace(/-/g, ' '));
      return vendorTokens.some(
        (v) => name.includes(v) || v.includes(name) || slug.includes(v) || v.includes(slug),
      );
    });

    return NextResponse.json({ guides });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load guides';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
