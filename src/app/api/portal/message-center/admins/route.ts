import { NextResponse } from 'next/server';
import { listAdminTeamMembers } from '@/lib/admin-team-members';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Handles for @mentioning Candid admins from the customer Message Center. */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const members = await listAdminTeamMembers(admin);

  return NextResponse.json({
    members: members.map((m) => ({
      handle: m.handle,
      displayName: m.displayName,
    })),
  });
}
