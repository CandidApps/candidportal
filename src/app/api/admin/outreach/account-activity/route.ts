import { NextResponse } from 'next/server';
import { listAdminTeamMembers } from '@/lib/admin-team-members';
import { getMyRole } from '@/lib/auth/roles';
import { listOutreachActivityForCustomer } from '@/lib/outreach-server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export type AccountOutreachRecord = {
  id: string;
  status: string;
  ownerName: string | null;
  assigneeNames: string[];
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  howCanWeHelp: string | null;
};

/** Outreach records + activity log for one account (CR-0029). */
export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const customerId = new URL(request.url).searchParams.get('customerId')?.trim();
  if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const team = await listAdminTeamMembers(admin);
  const names = new Map(team.map((m) => [m.id, m.displayName || m.email]));

  const { data: rows, error } = await admin
    .from('admin_outreach_accounts')
    .select('id, status, owner_user_id, assigned_user_ids, last_contacted_at, next_follow_up_at, how_can_we_help')
    .eq('customer_external_id', customerId)
    .order('updated_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const records: AccountOutreachRecord[] = (rows ?? []).map((r) => ({
    id: String(r.id),
    status: String(r.status),
    ownerName: names.get(String(r.owner_user_id)) ?? null,
    assigneeNames: ((r.assigned_user_ids as string[] | null) ?? [])
      .map((id) => names.get(id))
      .filter((n): n is string => Boolean(n)),
    lastContactedAt: (r.last_contacted_at as string | null) ?? null,
    nextFollowUpAt: (r.next_follow_up_at as string | null) ?? null,
    howCanWeHelp: (r.how_can_we_help as string | null) ?? null,
  }));

  try {
    const activity = await listOutreachActivityForCustomer(admin, customerId, names);
    return NextResponse.json({ records, activity });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load outreach activity';
    if (/admin_outreach_activity/.test(message)) {
      return NextResponse.json({ records, activity: [], migrationRequired: true });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
