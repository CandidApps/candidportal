import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { repairCustomerDealLocationLinks } from '@/lib/crm/repair-deal-locations';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { customerId?: string };
  try {
    body = (await request.json()) as { customerId?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const customerId = body.customerId?.trim();
  if (!customerId) {
    return NextResponse.json({ error: 'customerId required' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const result = await repairCustomerDealLocationLinks(admin, customerId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Repair failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
