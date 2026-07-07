import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Published quote requests for the signed-in member. */
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scope = new URL(request.url).searchParams.get('scope');
  let query = supabase.from('quote_requests').select('*').eq('user_id', user.id);

  if (scope === 'all') {
    query = query.order('created_at', { ascending: false }).limit(100);
  } else {
    query = query
      .not('published_quote_snapshot', 'is', null)
      .order('published_at', { ascending: false });
  }

  const { data, error } = await query;

  if (error) {
    if (error.message.includes('published_quote_snapshot')) {
      return NextResponse.json({ requests: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ requests: data ?? [] });
}
