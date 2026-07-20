import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isCandidAdminEmail, resolveAppRoleFromEmail } from "@/lib/auth/admin-email";

export type AppRole = "user" | "admin" | "agent";

export { isCandidAdminEmail, resolveAppRoleFromEmail };

/**
 * Resolve the current user's app role.
 * Profile reads go through the service-role client so recursive profiles RLS
 * cannot turn admins into "user" and 401 admin APIs.
 */
export async function getMyRole(): Promise<AppRole> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return "user";

  const email = user.email ?? "";

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!error) {
      return resolveAppRoleFromEmail(email, data?.role);
    }
  } catch {
    // Fall through to email rule when admin client / profiles are unavailable.
  }

  return isCandidAdminEmail(email) ? "admin" : "user";
}

export async function requireAdmin() {
  const role = await getMyRole();
  if (role !== "admin") {
    throw new Error("Not authorized");
  }
}
