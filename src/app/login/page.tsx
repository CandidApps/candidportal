import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/SignInForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
          Sign in with a one-time email link or your password.
        </p>

        <SignInForm initialError={error} />

        <div style={{ marginTop: 12, fontSize: 13, color: "#6b6b6b" }}>
          Use the email address your Candid account manager enabled for portal access.
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
