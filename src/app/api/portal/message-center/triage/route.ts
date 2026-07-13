import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logClaudeUsageAsync } from '@/lib/claude-usage';

export const dynamic = 'force-dynamic';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type TriageResult = {
  reply: string;
  category: 'supplier_issue' | 'quote_request' | 'billing' | 'technical' | 'general';
  needsMoreInfo: boolean;
  critical: boolean;
  supplierName: string | null;
  suggestedActions: string[];
  /** Filled in by the model when it has enough to summarize for the team. */
  summary: string | null;
};

const SYSTEM = `You are Hank, Candid's AI assistant inside the customer message center.
The customer wants to send a message to the Candid team. Your job is to triage it.

Be warm, concise, and helpful (max ~3 short sentences in "reply"). Speak in merchant voice ("you"/"we").

Decide:
- category: one of supplier_issue, quote_request, billing, technical, general.
- needsMoreInfo: true ONLY if the team genuinely could not act or respond without one more piece of context. If there is enough to respond, set false. Do not be annoying — never ask more than necessary.
- critical: true if this is urgent/critical (service outage, payments down, security incident, money at risk, hard deadline).
- supplierName: the supplier/vendor involved, or null.
- suggestedActions: 0-3 short next-step suggestions (e.g. "Open a ticket", "Request a quote"). Empty if none.
- summary: a one-line summary for the Candid team once you have enough info, else null.
- reply: your short message back to the customer. If needsMoreInfo, ask the single most useful follow-up question. If critical, acknowledge urgency.

Respond with ONLY a JSON object with keys: reply, category, needsMoreInfo, critical, supplierName, suggestedActions, summary. No markdown, no prose outside JSON.`;

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const key = process.env.ANTHROPIC_API_KEY;

  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const messages = (body.messages ?? [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && String(m.content ?? '').trim())
    .map((m) => ({ role: m.role, content: String(m.content) }));
  if (messages.length === 0) {
    return NextResponse.json({ error: 'messages required' }, { status: 400 });
  }

  // Graceful fallback when AI is unavailable: accept the message as a general note.
  const fallback: TriageResult = {
    reply: "Thanks — we've got your message and the Candid team will follow up shortly.",
    category: 'general',
    needsMoreInfo: false,
    critical: false,
    supplierName: null,
    suggestedActions: [],
    summary: messages[messages.length - 1]?.content?.slice(0, 200) ?? null,
  };

  if (!key) return NextResponse.json(fallback);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        system: SYSTEM,
        messages,
      }),
    });
    if (!response.ok) return NextResponse.json(fallback);

    const data = (await response.json()) as {
      content?: { type: string; text?: string }[];
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      };
    };
    logClaudeUsageAsync({
      routeLabel: 'portal-message-triage',
      usage: data.usage,
      maxTokens: 600,
    });
    const text = (data.content ?? [])
      .filter((b) => b?.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('\n')
      .trim();

    const jsonStr = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(jsonStr) as Partial<TriageResult>;
    return NextResponse.json({
      reply: parsed.reply ?? fallback.reply,
      category: parsed.category ?? 'general',
      needsMoreInfo: Boolean(parsed.needsMoreInfo),
      critical: Boolean(parsed.critical),
      supplierName: parsed.supplierName ?? null,
      suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions.slice(0, 3) : [],
      summary: parsed.summary ?? null,
    } satisfies TriageResult);
  } catch {
    return NextResponse.json(fallback);
  }
}
