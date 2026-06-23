import { isCandidAdminEmail, resolveAppRoleFromEmail } from '@/lib/auth/admin-email';
import { teamMemberHandle, type TeamMember } from '@/lib/admin-action-work';
import type { createSupabaseAdminClient } from '@/lib/supabase/admin';

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

function toTeamMember(id: string, email: string, displayName?: string | null): TeamMember | null {
  const normalizedEmail = email.trim();
  if (!normalizedEmail) return null;
  const name = displayName?.trim() || normalizedEmail.split('@')[0] || 'Team member';
  const base = { id, email: normalizedEmail, displayName: name };
  return { ...base, handle: teamMemberHandle(base) };
}

/** All users eligible for admin Action Center assignment (profile role or @candid.solutions). */
export async function listAdminTeamMembers(admin: AdminClient): Promise<TeamMember[]> {
  const byId = new Map<string, TeamMember>();

  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, email, display_name, role')
    .order('display_name', { ascending: true });

  if (!error) {
    for (const row of profiles ?? []) {
      const email = String(row.email ?? '').trim();
      if (!email) continue;
      if (resolveAppRoleFromEmail(email, row.role as string) !== 'admin') continue;
      const member = toTeamMember(String(row.id), email, row.display_name as string | null);
      if (member) byId.set(member.id, member);
    }
  }

  const { data: authData, error: authError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (!authError) {
    for (const user of authData?.users ?? []) {
      const email = (user.email ?? '').trim();
      if (!email) continue;
      if (!isCandidAdminEmail(email) && resolveAppRoleFromEmail(email, null) !== 'admin') continue;
      if (byId.has(user.id)) continue;
      const meta = user.user_metadata as { display_name?: string; name?: string } | undefined;
      const member = toTeamMember(
        user.id,
        email,
        meta?.display_name ?? meta?.name ?? null,
      );
      if (member) byId.set(member.id, member);
    }
  }

  return [...byId.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
  );
}

export function listAdminTeamMembersMap(admin: AdminClient): Promise<Map<string, TeamMember>> {
  return listAdminTeamMembers(admin).then((members) => new Map(members.map((m) => [m.id, m])));
}
