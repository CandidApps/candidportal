import CandidApp from "@/components/CandidApp";
import { getMyRole } from "@/lib/auth/roles";
import { userNeedsPasswordSetup } from "@/lib/auth/password-meta";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

async function signOut() {
  "use server";
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  if (userNeedsPasswordSetup(user)) {
    redirect("/auth/set-password?next=%2Fadmin");
  }

  const role = await getMyRole();
  if (role !== "admin") redirect(role === "agent" ? "/agent" : "/app");

  return (
    <CandidApp
      sessionUser={{
        email: user.email ?? "",
        name: (user.user_metadata?.full_name as string | undefined) ?? null,
      }}
      userId={user.id}
      appRole="admin"
      signOutAction={signOut}
    />
  );
}
