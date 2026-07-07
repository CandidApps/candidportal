import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { analyzeQuoteRequest } from '@/lib/quotes/quote-request-analysis';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { mapQuoteRequestRow, type QuoteRequestDbRow } from '@/lib/services/quote-requests';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from('quote_requests').select('*').eq('id', id).maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const row = mapQuoteRequestRow(data as QuoteRequestDbRow);
  return NextResponse.json({ suggestion: analyzeQuoteRequest(row) });
}
