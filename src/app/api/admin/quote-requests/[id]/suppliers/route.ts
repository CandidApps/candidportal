import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { filterSuppliersForQuoteCategory } from '@/lib/quotes/supplier-filter';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();

  const { data: quote, error: quoteErr } = await admin
    .from('quote_requests')
    .select('service_type_id')
    .eq('id', id)
    .maybeSingle();

  if (quoteErr) return NextResponse.json({ error: quoteErr.message }, { status: 500 });
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [providersRes, contactsRes, solutionsRes, ratesRes] = await Promise.all([
    admin.from('solution_providers').select('*').order('name'),
    admin.from('solution_provider_contacts').select('*'),
    admin.from('solution_provider_solutions').select('*'),
    admin.from('solution_provider_solution_rates').select('*'),
  ]);

  if (providersRes.error) {
    return NextResponse.json({ error: providersRes.error.message }, { status: 500 });
  }

  const suppliers = filterSuppliersForQuoteCategory(
    providersRes.data ?? [],
    contactsRes.data ?? [],
    solutionsRes.data ?? [],
    ratesRes.data ?? [],
    quote.service_type_id as string | null,
  );

  return NextResponse.json({ suppliers });
}
