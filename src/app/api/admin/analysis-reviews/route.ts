import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { mapReviewRow } from '@/lib/services/analysis-reviews';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const status = new URL(request.url).searchParams.get('status')?.trim();
  const admin = createSupabaseAdminClient();
  let query = admin
    .from('bill_analysis_reviews')
    .select('*')
    .order('created_at', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) {
    if (error.message.includes('bill_analysis_reviews')) {
      return NextResponse.json({ reviews: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reviews: (data ?? []).map(mapReviewRow) });
}
