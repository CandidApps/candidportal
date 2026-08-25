import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { seedWayneTechSpendDemo } from '@/lib/plaid/seed-wayne-tech-spend';
import { WAYNE_DEMO_CUSTOMER_EXTERNAL_ID } from '@/lib/plaid/wayne-demo-seed';

export const dynamic = 'force-dynamic';

/**
 * Admin-only: seed / refresh Wayne Enterprises Tech Spend demo data (no Plaid).
 * POST {} or { "customerExternalId": "id-8h47mo0y" }
 */
export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { customerExternalId?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    /* empty body ok */
  }

  const admin = createSupabaseAdminClient();
  const externalId = body.customerExternalId?.trim() || WAYNE_DEMO_CUSTOMER_EXTERNAL_ID;

  const { data: customer } = await admin
    .from('customers')
    .select('id, company, external_id')
    .eq('external_id', externalId)
    .maybeSingle();

  if (!customer?.id) {
    return NextResponse.json(
      { error: `Customer not found for external_id=${externalId}` },
      { status: 404 },
    );
  }

  try {
    const result = await seedWayneTechSpendDemo(admin, {
      customerUuid: String(customer.id),
    });
    return NextResponse.json({
      ok: true,
      company: customer.company,
      externalId: customer.external_id,
      ...result,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Seed failed' },
      { status: 500 },
    );
  }
}
