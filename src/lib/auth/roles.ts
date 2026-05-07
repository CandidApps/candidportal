import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppRole = "user" | "admin";

export async function getMyRole(): Promise<AppRole> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return "user";

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) return "user";
  if (!data?.role) return "user";
  return data.role === "admin" ? "admin" : "user";
}

export async function requireAdmin() {
  const role = await getMyRole();
  if (role !== "admin") {
    throw new Error("Not authorized");
  }
}

