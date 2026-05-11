import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1 style={{ marginBottom: 8 }}>Candid Portal</h1>
      <p style={{ marginTop: 0, color: "#6b6b6b", marginBottom: 20 }}>
        Next.js + Supabase scaffold is in place.
      </p>

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 24
        }}
      >
        <Link
          href="/login"
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #e2e2e2",
            background: "#fff",
            textDecoration: "none"
          }}
        >
          Go to Login
        </Link>
        <Link
          href="/legacy/remixed-7759712a.html"
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #e2e2e2",
            background: "#fff",
            textDecoration: "none"
          }}
        >
          Open Legacy HTML
        </Link>
        <Link
          href="/app"
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #e2e2e2",
            background: "#fff",
            textDecoration: "none"
          }}
        >
          Open Protected App
        </Link>
        <Link
          href="/admin"
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #e2e2e2",
            background: "#fff",
            textDecoration: "none"
          }}
        >
          Open Admin
        </Link>
      </div>

      <p style={{ color: "#6b6b6b", fontSize: 13, lineHeight: 1.6 }}>
        If you hit errors, make sure you created <code>.env.local</code> with
        Supabase URL + anon key.
      </p>
    </main>
  );
}

