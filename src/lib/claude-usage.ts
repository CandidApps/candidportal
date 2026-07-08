import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/** Claude Sonnet 4.6 list prices (USD per million tokens) as of early 2026. */
export const CLAUDE_SONNET_PRICING = {
  model: 'claude-sonnet-4-6',
  inputPerMTok: 3,
  outputPerMTok: 15,
  cacheWritePerMTok: 3.75,
  cacheReadPerMTok: 0.3,
} as const;

export type ClaudeUsageSnapshot = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

export type ClaudeRouteDef = {
  id: string;
  area: string;
  feature: string;
  label: string;
  description: string;
};

/** Canonical registry of Claude call sites → product UI context. */
export const CLAUDE_ROUTE_REGISTRY: Record<string, ClaudeRouteDef> = {
  'assistant-brief': {
    id: 'assistant-brief',
    area: 'My Assistant',
    feature: 'Daily brief',
    label: 'My Assistant · Brief',
    description: 'Daily brief generation and inbox triage',
  },
  'assistant-chat': {
    id: 'assistant-chat',
    area: 'My Assistant',
    feature: 'Hank chat',
    label: 'My Assistant · Chat',
    description: 'My Assistant Hank chat (FAB)',
  },
  'assistant-draft': {
    id: 'assistant-draft',
    area: 'My Assistant',
    feature: 'Email draft',
    label: 'My Assistant · Email draft',
    description: 'Reply and compose email drafts',
  },
  hank: {
    id: 'hank',
    area: 'Commissions',
    feature: 'Ask Hank',
    label: 'Commissions · Ask Hank',
    description: 'Global commissions Ask Hank panel',
  },
  'team-hank-chat': {
    id: 'team-hank-chat',
    area: 'Team',
    feature: 'Team @Hank',
    label: 'Team · @Hank chat',
    description: 'Admin team message center @Hank replies',
  },
  'analysis-chat': {
    id: 'analysis-chat',
    area: 'Customer analysis',
    feature: 'Analysis chat',
    label: 'Customer analysis · Chat',
    description: 'Merchant / bill analysis conversational Q&A',
  },
  'parse-bill': {
    id: 'parse-bill',
    area: 'Document parsing',
    feature: 'Bill parse',
    label: 'Document parsing · Bill upload',
    description: 'Classify and extract fields from uploaded bills',
  },
  'parse-statement': {
    id: 'parse-statement',
    area: 'Document parsing',
    feature: 'Statement parse',
    label: 'Document parsing · Statement',
    description: 'Merchant processing statement extraction',
  },
  'parse-customer-document': {
    id: 'parse-customer-document',
    area: 'Document parsing',
    feature: 'Customer document',
    label: 'Document parsing · Customer doc',
    description: 'Customer onboarding document extraction',
  },
  'parse-schedule-a': {
    id: 'parse-schedule-a',
    area: 'Document parsing',
    feature: 'Schedule A',
    label: 'Document parsing · Schedule A',
    description: 'Admin Schedule A rate extraction',
  },
  'chat-attachment': {
    id: 'chat-attachment',
    area: 'Chat',
    feature: 'Attachment OCR',
    label: 'Chat · Attachment text',
    description: 'Extract text from chat attachments',
  },
  'customer-sentiment': {
    id: 'customer-sentiment',
    area: 'Customers',
    feature: 'Sentiment',
    label: 'Customers · Sentiment',
    description: 'Customer email thread relationship health',
  },
  'portal-message-triage': {
    id: 'portal-message-triage',
    area: 'Portal',
    feature: 'Message triage',
    label: 'Portal · Message triage',
    description: 'Member message center AI triage',
  },
  'company-address-lookup': {
    id: 'company-address-lookup',
    area: 'Customers',
    feature: 'Website lookup',
    label: 'Customers · Website lookup',
    description: 'Company address and MCC from website crawl',
  },
  'hank-edge': {
    id: 'hank-edge',
    area: 'Other',
    feature: 'Hank edge function',
    label: 'Other · Hank (edge)',
    description: 'Legacy Hank chat Supabase edge function',
  },
  askHankServer: {
    id: 'askHankServer',
    area: 'Other',
    feature: 'Unlabeled Hank',
    label: 'Other · Hank (unlabeled)',
    description: 'askHankServer call without a route label',
  },
};

export function resolveClaudeRoute(routeLabel: string): ClaudeRouteDef {
  return (
    CLAUDE_ROUTE_REGISTRY[routeLabel] ?? {
      id: routeLabel,
      area: 'Other',
      feature: routeLabel,
      label: routeLabel,
      description: 'Unregistered Claude call site',
    }
  );
}

export function estimateClaudeCostUsd(usage: ClaudeUsageSnapshot): number {
  const input = Number(usage.input_tokens) || 0;
  const output = Number(usage.output_tokens) || 0;
  const cacheWrite = Number(usage.cache_creation_input_tokens) || 0;
  const cacheRead = Number(usage.cache_read_input_tokens) || 0;
  const p = CLAUDE_SONNET_PRICING;
  return (
    (input / 1_000_000) * p.inputPerMTok +
    (output / 1_000_000) * p.outputPerMTok +
    (cacheWrite / 1_000_000) * p.cacheWritePerMTok +
    (cacheRead / 1_000_000) * p.cacheReadPerMTok
  );
}

export type RecordClaudeUsageInput = {
  routeLabel: string;
  userId?: string | null;
  model?: string;
  usage: ClaudeUsageSnapshot | undefined;
  maxTokens?: number;
  /** e.g. manual_sync, auto_refresh, contract, customer */
  usageTrigger?: string | null;
};

/** Fire-and-forget insert; never throws to callers. */
export async function recordClaudeUsage(
  admin: SupabaseClient,
  input: RecordClaudeUsageInput,
): Promise<void> {
  if (!input.usage) return;
  try {
    const route = resolveClaudeRoute(input.routeLabel);
    const estimated = estimateClaudeCostUsd(input.usage);
    const baseRow = {
      route_label: input.routeLabel,
      user_id: input.userId ?? null,
      model: input.model ?? CLAUDE_SONNET_PRICING.model,
      input_tokens: Number(input.usage.input_tokens) || 0,
      output_tokens: Number(input.usage.output_tokens) || 0,
      cache_creation_input_tokens: Number(input.usage.cache_creation_input_tokens) || 0,
      cache_read_input_tokens: Number(input.usage.cache_read_input_tokens) || 0,
      max_tokens: input.maxTokens ?? null,
      estimated_cost_usd: Math.round(estimated * 1_000_000) / 1_000_000,
    };
    const fullRow = {
      ...baseRow,
      feature_area: route.area,
      feature_name: route.feature,
      usage_trigger: input.usageTrigger ?? null,
    };
    let { error } = await admin.from('claude_usage_events').insert(fullRow);
    if (error && /feature_area|feature_name|usage_trigger/.test(error.message)) {
      ({ error } = await admin.from('claude_usage_events').insert(baseRow));
    }
    if (error && !/claude_usage_events/.test(error.message)) {
      console.warn('[claude-usage] insert failed:', error.message);
    }
  } catch (err) {
    console.warn('[claude-usage] insert error:', err);
  }
}

/** Best-effort logging from any route handler (creates admin client internally). */
export function logClaudeUsageAsync(input: RecordClaudeUsageInput): void {
  try {
    const admin = createSupabaseAdminClient();
    void recordClaudeUsage(admin, input);
  } catch {
    /* ignore missing env during build */
  }
}

export function usageFromSdkMessage(message: {
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  };
}): ClaudeUsageSnapshot | undefined {
  if (!message.usage) return undefined;
  return {
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
    cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? undefined,
    cache_read_input_tokens: message.usage.cache_read_input_tokens ?? undefined,
  };
}

/** Soft TTL for My Assistant Brief — skip Claude if cache is fresher than this. */
export const BRIEF_CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes

export function briefCacheIsFresh(generatedAt: string | null | undefined, ttlMs = BRIEF_CACHE_TTL_MS): boolean {
  if (!generatedAt) return false;
  const t = new Date(generatedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < ttlMs;
}
