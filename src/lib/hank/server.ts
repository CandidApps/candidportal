import { HANK_SYSTEM_PROMPT } from '@/lib/candid-data';

type AnthropicContentBlock = { type: string; text?: string };

export type HankChatMessage = { role: 'user' | 'assistant'; content: string };

type CacheControl = { type: 'ephemeral' };
type SystemTextBlock = { type: 'text'; text: string; cache_control?: CacheControl };

/**
 * Wraps a static system prompt in the content-block form Anthropic prompt-caches.
 * The block is cached on first use and re-read (~90% input-token discount) on
 * repeat calls within the cache TTL (~5 min). Caching is silently skipped by the
 * API when the block is below the model's minimum cacheable size.
 */
export function cachedSystem(text: string): SystemTextBlock[] {
  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
}

type AnthropicUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

/** Lightweight visibility into prompt-cache effectiveness without noisy logs. */
export function logCacheUsage(label: string, usage: AnthropicUsage | undefined): void {
  if (!usage) return;
  const created = usage.cache_creation_input_tokens ?? 0;
  const read = usage.cache_read_input_tokens ?? 0;
  if (created === 0 && read === 0) return;
  console.log(
    `[prompt-cache] ${label}: read=${read} created=${created} input=${usage.input_tokens ?? 0}`,
  );
}

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

  // Cache the conversation prefix too: marking the final message lets multi-turn
  // chats re-read everything up to the latest message instead of re-billing it.
  const messagesPayload = clean.map((m, i) =>
    i === clean.length - 1
      ? { role: m.role, content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }] }
      : m,
  );

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
      system: cachedSystem(options?.systemPrompt?.trim() || HANK_SYSTEM_PROMPT),
      messages: messagesPayload,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('askHankServer Anthropic error:', response.status, errText);
    let message = 'AI service unavailable — try again shortly.';
    try {
      const parsed = JSON.parse(errText) as { error?: { message?: string } };
      const apiMsg = parsed.error?.message ?? '';
      if (/credit balance/i.test(apiMsg)) {
        message = 'Anthropic API credits are exhausted. Add credits or update ANTHROPIC_API_KEY.';
      } else if (apiMsg) {
        message = apiMsg;
      }
    } catch {
      /* use default */
    }
    if (response.status === 401 || response.status === 403) {
      message = 'Anthropic API key is invalid or unauthorized.';
    }
    throw new Error(message);
  }

  const data = (await response.json()) as {
    content?: AnthropicContentBlock[];
    usage?: AnthropicUsage;
  };
  logCacheUsage('askHankServer', data.usage);
  return (
    extractText(data.content) ??
    "I'm having a moment — try mentioning me again in a sec."
  );
}
