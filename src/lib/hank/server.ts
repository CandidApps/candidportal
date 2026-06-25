import { HANK_SYSTEM_PROMPT } from '@/lib/candid-data';

type AnthropicContentBlock = { type: string; text?: string };

export type HankChatMessage = { role: 'user' | 'assistant'; content: string };

function extractText(content: unknown): string | undefined {
  if (!Array.isArray(content) || content.length === 0) return undefined;
  const parts: string[] = [];
  for (const block of content as AnthropicContentBlock[]) {
    if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text);
  }
  return parts.length ? parts.join('\n\n') : undefined;
}

/**
 * Server-side call to Hank (Anthropic). Mirrors /api/hank but callable from
 * other route handlers without an internal HTTP round-trip.
 */
export async function askHankServer(
  messages: HankChatMessage[],
  options?: { systemPrompt?: string; maxTokens?: number },
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured');

  const clean = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: String(m.content ?? '') }))
    .filter((m) => m.content.length > 0);

  if (clean.length === 0) throw new Error('messages required');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: options?.maxTokens ?? 1000,
      system: options?.systemPrompt?.trim() || HANK_SYSTEM_PROMPT,
      messages: clean,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('askHankServer Anthropic error:', response.status, errText);
    throw new Error('Upstream API error');
  }

  const data = (await response.json()) as { content?: AnthropicContentBlock[] };
  return (
    extractText(data.content) ??
    "I'm having a moment — try mentioning me again in a sec."
  );
}
