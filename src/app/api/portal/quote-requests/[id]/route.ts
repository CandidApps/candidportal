import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { assertPortalQuoteRequestAccess } from '@/lib/portal/quote-access';
import { mapQuoteRequestRow, type QuoteRequestDbRow } from '@/lib/services/quote-requests';

export const dynamic = 'force-dynamic';

/** Single quote request for a signed-in portal member (includes published snapshot). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const url = new URL(request.url);
  const access = await assertPortalQuoteRequestAccess({
    quoteRequestId: id,
    userId: user.id,
    email: user.email,
    customerExternalId: url.searchParams.get('customerId'),
  });
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from('quote_requests').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ request: mapQuoteRequestRow(data as QuoteRequestDbRow) });
}
