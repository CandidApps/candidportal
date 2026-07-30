import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { mergeCustomerAccounts } from '@/lib/crm/merge-customers';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { sourceCustomerId?: string; targetCustomerId?: string };
  try {
    body = (await request.json()) as { sourceCustomerId?: string; targetCustomerId?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const sourceCustomerId = body.sourceCustomerId?.trim();
  const targetCustomerId = body.targetCustomerId?.trim();
  if (!sourceCustomerId || !targetCustomerId) {
    return NextResponse.json({ error: 'sourceCustomerId and targetCustomerId required' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const result = await mergeCustomerAccounts(admin, sourceCustomerId, targetCustomerId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Merge failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
