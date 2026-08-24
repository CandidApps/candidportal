import CandidApp from "@/components/CandidApp";
import { getMyRole } from "@/lib/auth/roles";
import { userNeedsPasswordSetup } from "@/lib/auth/password-meta";
import { resolveMemberPortalCustomer } from "@/lib/portal/member-customer-resolve";
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

  const portalCustomer = user.email
    ? await resolveMemberPortalCustomer(user.email, { requirePortalAccess: true })
    : null;

  return (
    <CandidApp
      sessionUser={{
        email: user.email ?? "",
        name:
          portalCustomer?.contactName?.trim() ||
          (user.user_metadata?.full_name as string | undefined)?.trim() ||
          null,
        companyName: portalCustomer?.companyName?.trim() || null,
      }}
      userId={user.id}
      appRole={role}
      signOutAction={signOut}
    />
  );
}
