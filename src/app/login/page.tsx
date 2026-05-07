import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function signIn(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/app");
}

export default async function LoginPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) redirect("/app");

  const error = (await searchParams)?.error;

  return (
    <main>
      <div
        style={{
          maxWidth: 420,
          background: "#fff",
          border: "1px solid #e2e2e2",
          borderRadius: 12,
          padding: 20
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: 8 }}>Sign in</h1>
        <p style={{ marginTop: 0, color: "#6b6b6b", marginBottom: 16 }}>
          Supabase Auth (email + password)
        </p>

        {error ? (
          <div
            style={{
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#991b1b",
              padding: "10px 12px",
              borderRadius: 10,
              marginBottom: 12,
              fontSize: 13
            }}
          >
            {error}
          </div>
        ) : null}

        <form action={signIn} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#6b6b6b" }}>Email</span>
            <input
              name="email"
              type="email"
              required
              placeholder="you@company.com"
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e2e2e2"
              }}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#6b6b6b" }}>Password</span>
            <input
              name="password"
              type="password"
              required
              placeholder="••••••••"
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e2e2e2"
              }}
            />
          </label>
          <button
            type="submit"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #8b1a12",
              background: "#c8281e",
              color: "#fff",
              fontWeight: 600
            }}
          >
            Sign in
          </button>
        </form>

        <div style={{ marginTop: 12, fontSize: 13, color: "#6b6b6b" }}>
          Need a user? Create one in Supabase Dashboard → Authentication → Users.
        </div>

        <div style={{ marginTop: 16 }}>
          <Link href="/" style={{ fontSize: 13 }}>
            ← Back
          </Link>
        </div>
      </div>
    </main>
  );
}

