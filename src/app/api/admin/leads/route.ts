import { NextResponse } from 'next/server';
import type { Lead } from '@/components/LeadsView';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** Admin: portal-generated leads (e.g. from bill analysis uploads). */
export async function GET() {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('portal_leads')
    .select('lead_data, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    if (/portal_leads/.test(error.message)) {
      return NextResponse.json({ leads: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const leads = (data ?? [])
    .map((row) => row.lead_data as Lead)
    .filter((lead) => lead && typeof lead.id === 'string');

  return NextResponse.json({ leads });
}
