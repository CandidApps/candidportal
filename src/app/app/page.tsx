import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyRole } from "@/lib/auth/roles";

async function signOut() {
  "use server";
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export default async function AppPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const role = await getMyRole();

  return (
    <main>
      <h1 style={{ marginBottom: 8 }}>Protected App</h1>
      <p style={{ marginTop: 0, color: "#6b6b6b", marginBottom: 20 }}>
        You are signed in as <strong>{user.email}</strong>.
      </p>
      <p style={{ marginTop: 0, color: "#6b6b6b", marginBottom: 20 }}>
        Role: <strong>{role}</strong>
      </p>

      <form action={signOut}>
        <button
          type="submit"
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #e2e2e2",
            background: "#fff",
            fontWeight: 600
          }}
        >
          Sign out
        </button>
      </form>
    </main>
  );
}

