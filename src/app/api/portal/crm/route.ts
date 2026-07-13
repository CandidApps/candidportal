import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadCrmCustomerSlice } from '@/lib/crm/load-from-db';

/** Member-scoped CRM data for a single customer account. */
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const customerId = new URL(request.url).searchParams.get('customerId')?.trim();
  if (!customerId) {
    return NextResponse.json({ error: 'customerId required' }, { status: 400 });
  }

  try {
    const data = await loadCrmCustomerSlice(customerId);
    if (!data) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'CRM load failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
