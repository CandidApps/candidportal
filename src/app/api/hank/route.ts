import { NextResponse } from "next/server";
import { HANK_SYSTEM_PROMPT } from "@/lib/candid-data";
import { askHankServer } from "@/lib/hank/server";
import { getMyRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type HankMessage = { role: string; content: string };

export async function POST(req: Request) {
  let body: { messages?: HankMessage[]; systemPrompt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const systemPrompt =
    typeof body.systemPrompt === "string" && body.systemPrompt.trim()
      ? body.systemPrompt.trim()
      : HANK_SYSTEM_PROMPT;

  const raw = body.messages ?? [];
  const messages = raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content ?? ""),
    }))
    .filter((m) => m.content.length > 0);

  if (messages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  let userId: string | null = null;
  try {
    const role = await getMyRole();
    if (role === "admin") {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    }
  } catch {
    /* optional identity for analytics */
  }

  try {
    const text = await askHankServer(messages, {
      systemPrompt,
      maxTokens: 1000,
      routeLabel: "hank",
      userId,
    });
    return NextResponse.json({
      text:
        text ||
        "I'm having a moment. Even I have them occasionally — usually when staring at a Comcast invoice. Try again in a second.",
    });
  } catch (e) {
    console.error("Hank route error:", e);
    const message = e instanceof Error ? e.message : "Request failed";
    if (/ANTHROPIC_API_KEY/.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
