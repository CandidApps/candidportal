import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { searchSupplierProducts } from '@/lib/solutions/product-search';

export const dynamic = 'force-dynamic';

/** Suppliers whose sellable products match `q`. Returns product names only — never rates. */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = (new URL(req.url).searchParams.get('q') ?? '').slice(0, 200).trim();
  if (q.length < 2) return NextResponse.json({ matches: [] });

  try {
    const matches = await searchSupplierProducts(createSupabaseAdminClient(), q);
    return NextResponse.json({ matches });
  } catch (e) {
    console.error('[portal/solutions/products]', e);
    return NextResponse.json({ matches: [] });
  }
}
