import { HANK_SYSTEM_PROMPT } from '@/lib/candid-data';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { recordClaudeUsage, type ClaudeUsageSnapshot } from '@/lib/claude-usage';

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

/** Multi-block system for large static instructions + volatile day data. */
export function cachedSystemBlocks(
  staticText: string,
  volatileText?: string | null,
): SystemTextBlock[] {
  const blocks: SystemTextBlock[] = [
    { type: 'text', text: staticText, cache_control: { type: 'ephemeral' } },
  ];
  if (volatileText?.trim()) {
    blocks.push({ type: 'text', text: volatileText.trim() });
  }
  return blocks;
}

export type AnthropicUsage = ClaudeUsageSnapshot;

/** Lightweight visibility into prompt-cache effectiveness without noisy logs. */
export function logCacheUsage(label: string, usage: AnthropicUsage | undefined): void {
  if (!usage) return;
  const created = usage.cache_creation_input_tokens ?? 0;
  const read = usage.cache_read_input_tokens ?? 0;
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  console.log(
    `[claude-usage] ${label}: input=${input} output=${output} cache_read=${read} cache_write=${created}`,
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

export type AskHankOptions = {
  systemPrompt?: string;
  /** When set with systemPrompt, builds a cacheable static block + volatile block. */
  systemVolatile?: string | null;
  maxTokens?: number;
  /** Analytics label, e.g. assistant-brief, assistant-chat */
  routeLabel?: string;
  userId?: string | null;
  /** e.g. manual_sync, auto_refresh */
  usageTrigger?: string | null;
};

/**
 * Server-side call to Hank (Anthropic). Mirrors /api/hank but callable from
 * other route handlers without an internal HTTP round-trip.
 */
export async function askHankServer(
  messages: HankChatMessage[],
  options?: AskHankOptions,
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured');

  const clean = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: String(m.content ?? '') }))
    .filter((m) => m.content.length > 0);

  if (clean.length === 0) throw new Error('messages required');

  const maxTokens = options?.maxTokens ?? 1000;
  const routeLabel = options?.routeLabel ?? 'askHankServer';

  // Cache the conversation prefix too: marking the final message lets multi-turn
  // chats re-read everything up to the latest message instead of re-billing it.
  const messagesPayload = clean.map((m, i) =>
    i === clean.length - 1
      ? { role: m.role, content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }] }
      : m,
  );

  const system =
    options?.systemPrompt?.trim() && options.systemVolatile != null
      ? cachedSystemBlocks(options.systemPrompt.trim(), options.systemVolatile)
      : cachedSystem(options?.systemPrompt?.trim() || HANK_SYSTEM_PROMPT);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system,
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
  logCacheUsage(routeLabel, data.usage);

  // Persist usage for the Claude analytics admin screen (best-effort).
  try {
    const admin = createSupabaseAdminClient();
    void recordClaudeUsage(admin, {
      routeLabel,
      userId: options?.userId,
      usage: data.usage,
      maxTokens,
      usageTrigger: options?.usageTrigger,
    });
  } catch {
    /* ignore missing env during build */
  }

  return (
    extractText(data.content) ??
    "I'm having a moment — try mentioning me again in a sec."
  );
}
