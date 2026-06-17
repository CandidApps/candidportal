import { NextResponse } from "next/server";
import { HANK_SYSTEM_PROMPT } from "@/lib/candid-data";

type HankMessage = { role: string; content: string };

type AnthropicContentBlock = { type: string; text?: string };

/** Concatenate all text blocks; ignore tool_use and unknown shapes without duplicating logic. */
function extractTextFromContent(content: unknown): string | undefined {
  if (!Array.isArray(content) || content.length === 0) return undefined;
  const parts: string[] = [];
  for (const block of content as AnthropicContentBlock[]) {
    if (block?.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  if (parts.length === 0) return undefined;
  return parts.join("\n\n");
}

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 503 }
    );
  }

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

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      return NextResponse.json(
        { error: "Upstream API error" },
        { status: response.status }
      );
    }

    const data = (await response.json()) as {
      content?: AnthropicContentBlock[];
    };
    const text = extractTextFromContent(data.content);

    return NextResponse.json({
      text:
        text ??
        "I'm having a moment. Even I have them occasionally — usually when staring at a Comcast invoice. Try again in a second.",
    });
  } catch (e) {
    console.error("Hank route error:", e);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
