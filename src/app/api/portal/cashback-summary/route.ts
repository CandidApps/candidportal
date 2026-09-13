import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { resolveMemberPortalCustomer } from '@/lib/portal/member-customer-resolve';
import { getMemberCashbackSummary } from '@/lib/services/member-cashback';

export const dynamic = 'force-dynamic';

/** Member cash back totals and recent ledger rows (CR-0001 phase 2). */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ctx = await resolveMemberPortalCustomer(user.email, { requirePortalAccess: true });
  if (!ctx?.customerExternalId) {
    return NextResponse.json({ summary: null });
  }

  try {
    const admin = createSupabaseAdminClient();
    const summary = await getMemberCashbackSummary(admin, ctx.customerExternalId);
    return NextResponse.json({ summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load cash back summary';
    if (/member_cashback_ledger/.test(message)) {
      return NextResponse.json({ summary: null, migrationRequired: true });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
