import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyRole } from "@/lib/auth/roles";

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = await getMyRole();
  if (role !== "admin") redirect("/app");

  return (
    <main>
      <h1 style={{ marginBottom: 8 }}>Admin</h1>
      <p style={{ marginTop: 0, color: "#6b6b6b", marginBottom: 20 }}>
        Admin-only area. Your role is <strong>{role}</strong>.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/app">Back to app</Link>
      </div>
    </main>
  );
}

