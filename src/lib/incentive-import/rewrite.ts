import type Anthropic from '@anthropic-ai/sdk';
import type { CampaignStructureType } from '@/lib/incentive-campaigns';
import { applyGuardrails } from '@/lib/incentive-import/guardrails';
import { spiffImportKey } from '@/lib/incentive-import/layouts';
import { SPIFF_REWRITE_SYSTEM_PROMPT, buildSpiffRewriteUserMessage } from '@/lib/incentive-import/prompt';
import {
  SPIFF_CATEGORIES,
  type RawSpiffRow,
  type SpiffDraft,
  type SpiffFlag,
} from '@/lib/incentive-import/types';

export const SPIFF_REWRITE_MODEL = 'claude-sonnet-4-6';

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s || undefined;
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[$,\s]/g, '')) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function flagOf(v: unknown): SpiffFlag {
  return v === 'yes' || v === 'no' ? v : 'review';
}

function payoutTypeOf(v: unknown): CampaignStructureType | null {
  return v === 'multiplier' || v === 'dollar' || v === 'percent' ? v : null;
}

function categoryOf(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  return (SPIFF_CATEGORIES as readonly string[]).includes(s) ? s : 'Other';
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  return JSON.parse(start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed);
}

export function aiResultToDraft(raw: RawSpiffRow, ai: Record<string, unknown> | undefined): SpiffDraft {
  const provider = raw.provider ?? str(ai?.provider) ?? '';
  const base = {
    rowNumber: raw.rowNumber,
    raw,
    provider,
    sourceProgram: raw.sourceProgram,
    importKey: spiffImportKey({ ...raw, provider }),
    startsOn: raw.startsOn,
    endsOn: raw.endsOn,
    link: raw.link,
  };
  if (!ai) {
    return {
      ...base,
      flag: 'review',
      flagReason: 'AI rewrite missing for this row.',
      guardrailIssues: [],
      internalName: raw.name,
      internalDescription: raw.description,
      internalTerms: raw.terms,
      payoutRaw: raw.payout,
      payoutType: null,
      payoutValue: null,
      payoutUpTo: false,
      minMonthlyCharge: null,
      minTermMonths: null,
      customerName: '',
      customerDescription: '',
      customerCriteria: '',
      error: 'No AI result',
    };
  }
  const payoutType = payoutTypeOf(ai.payoutType);
  const minTerm = num(ai.minTermMonths);
  const draft: SpiffDraft = {
    ...base,
    flag: flagOf(ai.flag),
    flagReason: str(ai.flagReason),
    guardrailIssues: [],
    category: categoryOf(ai.category),
    internalName: str(ai.internalName) ?? raw.name,
    internalDescription: str(ai.internalDescription) ?? raw.description,
    internalTerms: str(ai.internalTerms) ?? raw.terms,
    adminNotes: str(ai.adminNotes),
    payoutRaw: str(ai.payoutRaw) ?? raw.payout,
    payoutType,
    payoutValue: payoutType ? num(ai.payoutValue) : null,
    payoutUpTo: ai.payoutUpTo === true,
    minMonthlyCharge: num(ai.minMonthlyCharge),
    minTermMonths: minTerm == null ? null : Math.round(minTerm),
    payoutTimeline: str(ai.payoutTimeline) ?? raw.payoutTimeline,
    customerName: str(ai.customerName) ?? '',
    customerDescription: str(ai.customerDescription) ?? '',
    customerCriteria: str(ai.customerCriteria) ?? '',
  };
  const checked = applyGuardrails(draft);
  if (checked.flag !== draft.flag) {
    draft.flagReason = [draft.flagReason, 'Customer copy needs a look (see issues).'].filter(Boolean).join(' ');
  }
  draft.flag = checked.flag;
  draft.guardrailIssues = checked.issues;
  return draft;
}

/** One AI call for a batch of rows; missing rows come back as Review drafts. */
export async function rewriteSpiffBatch(
  client: Anthropic,
  rows: RawSpiffRow[],
): Promise<{ drafts: SpiffDraft[]; message: Anthropic.Message; maxTokens: number }> {
  const maxTokens = 1200 * rows.length + 800;
  const message = await client.messages.create({
    model: SPIFF_REWRITE_MODEL,
    max_tokens: maxTokens,
    system: SPIFF_REWRITE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildSpiffRewriteUserMessage(rows) }],
  });
  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') throw new Error('No response from model');
  const parsed = extractJson(textBlock.text) as { rows?: Record<string, unknown>[] };
  const byRow = new Map<number, Record<string, unknown>>();
  for (const r of parsed.rows ?? []) {
    const n = Number(r?.rowNumber);
    if (Number.isFinite(n)) byRow.set(n, r);
  }
  return { drafts: rows.map((raw) => aiResultToDraft(raw, byRow.get(raw.rowNumber))), message, maxTokens };
}
