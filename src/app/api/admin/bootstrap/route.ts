import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Body = {
  secret?: string;
  email?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const providedSecret = body?.secret;
  const email = body?.email?.trim().toLowerCase();

  const expectedSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "ADMIN_BOOTSTRAP_SECRET not set" },
      { status: 500 }
    );
  }

  if (!providedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: userList, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200
  });
  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }

  const user = userList.users.find((u) => (u.email ?? "").toLowerCase() === email);
  if (!user) {
    return NextResponse.json(
      {
        error:
          "No such auth user. Create the user in Supabase Auth first, then retry."
      },
      { status: 404 }
    );
  }

  const { error: upsertErr } = await admin.from("profiles").upsert(
    {
      id: user.id,
      email: user.email,
      role: "admin"
    },
    { onConflict: "id" }
  );

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email, userId: user.id });
}

