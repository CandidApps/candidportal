import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCandidAdminEmail, resolveAppRoleFromEmail } from "@/lib/auth/admin-email";

export type AppRole = "user" | "admin";

export { isCandidAdminEmail, resolveAppRoleFromEmail };

export async function getMyRole(): Promise<AppRole> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return "user";

  const email = user.email ?? "";

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return isCandidAdminEmail(email) ? "admin" : "user";
  }

  return resolveAppRoleFromEmail(email, data?.role);
}

export async function requireAdmin() {
  const role = await getMyRole();
  if (role !== "admin") {
    throw new Error("Not authorized");
  }
}
