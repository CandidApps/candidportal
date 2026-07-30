import { HANK_SYSTEM_PROMPT } from '@/lib/candid-data';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { recordClaudeUsage, type ClaudeUsageSnapshot } from '@/lib/claude-usage';

type CacheControl = { type: 'ephemeral' };
type SystemTextBlock = { type: 'text'; text: string; cache_control?: CacheControl };

type AnthropicContentBlock = {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
};

type AnthropicMessage =
  | { role: 'user' | 'assistant'; content: string }
  | { role: 'assistant'; content: AnthropicContentBlock[] }
  | { role: 'user'; content: AnthropicContentBlock[] };

export type HankChatMessage = { role: 'user' | 'assistant'; content: string };

export type AnthropicUsage = ClaudeUsageSnapshot;

export type AnthropicToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

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
  /** Anthropic tool definitions for agentic DB / API access. */
  tools?: AnthropicToolDefinition[];
  /** Executes a tool call from the model; return stringified result for tool_result. */
  runTool?: (name: string, input: Record<string, unknown>) => Promise<string>;
  /** Max tool-use round trips (default 8). */
  maxToolIterations?: number;
};

/**
 * Wraps a static system prompt in the content-block form Anthropic prompt-caches.
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

function buildSystem(options?: AskHankOptions): SystemTextBlock[] {
  return options?.systemPrompt?.trim() && options.systemVolatile != null
    ? cachedSystemBlocks(options.systemPrompt.trim(), options.systemVolatile)
    : cachedSystem(options?.systemPrompt?.trim() || HANK_SYSTEM_PROMPT);
}

async function recordUsage(
  routeLabel: string,
  usage: AnthropicUsage | undefined,
  options?: AskHankOptions,
  maxTokens?: number,
): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    void recordClaudeUsage(admin, {
      routeLabel,
      userId: options?.userId,
      usage,
      maxTokens,
      usageTrigger: options?.usageTrigger,
    });
  } catch {
    /* ignore missing env during build */
  }
}

async function callAnthropicMessages(
  key: string,
  body: Record<string, unknown>,
): Promise<{ content?: AnthropicContentBlock[]; usage?: AnthropicUsage }> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
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

  return (await response.json()) as {
    content?: AnthropicContentBlock[];
    usage?: AnthropicUsage;
  };
}

/**
 * Server-side call to Hank (Anthropic). When tools + runTool are provided, runs
 * an agentic loop until the model returns a final text response.
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
  const system = buildSystem(options);
  const tools = options?.tools;
  const runTool = options?.runTool;
  const maxIterations = options?.maxToolIterations ?? 8;

  const initialMessages: AnthropicMessage[] = clean.map((m, i) => {
    if (i !== clean.length - 1) {
      return { role: m.role, content: m.content };
    }
    if (m.role === 'user') {
      return {
        role: 'user',
        content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }],
      };
    }
    return {
      role: 'assistant',
      content: [{ type: 'text', text: m.content }],
    };
  });

  let anthropicMessages: AnthropicMessage[] = initialMessages;
  let lastUsage: AnthropicUsage | undefined;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const requestBody: Record<string, unknown> = {
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system,
      messages: anthropicMessages,
    };
    if (tools?.length && runTool) {
      requestBody.tools = tools;
    }

    const data = await callAnthropicMessages(key, requestBody);
    lastUsage = data.usage;
    const content = data.content ?? [];
    const toolUses = content.filter((b) => b.type === 'tool_use');

    if (!toolUses.length || !runTool) {
      logCacheUsage(routeLabel, lastUsage);
      await recordUsage(routeLabel, lastUsage, options, maxTokens);
      return (
        extractText(content) ??
        "I'm having a moment — try mentioning me again in a sec."
      );
    }

    anthropicMessages = [
      ...anthropicMessages,
      { role: 'assistant', content },
      {
        role: 'user',
        content: await Promise.all(
          toolUses.map(async (toolUse) => {
            const toolName = toolUse.name ?? '';
            const result = await runTool(toolName, toolUse.input ?? {});
            return {
              type: 'tool_result',
              tool_use_id: toolUse.id ?? '',
              content: result,
            };
          }),
        ),
      },
    ];
  }

  logCacheUsage(routeLabel, lastUsage);
  await recordUsage(routeLabel, lastUsage, options, maxTokens);
  throw new Error('Hank exceeded the maximum number of database lookups for one question.');
}
