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

export default async function AppPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  if (userNeedsPasswordSetup(user)) {
    redirect("/auth/set-password?next=%2Fapp");
  }

  const role = await getMyRole();
  if (role === "admin") redirect("/admin");
  if (role === "agent") redirect("/agent");

  return (
    <CandidApp
      sessionUser={{
        email: user.email ?? "",
        name: (user.user_metadata?.full_name as string | undefined) ?? null,
      }}
      userId={user.id}
      appRole={role}
      signOutAction={signOut}
    />
  );
}
