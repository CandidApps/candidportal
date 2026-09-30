import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getMyRole } from '@/lib/auth/roles';
import { logClaudeUsageAsync, usageFromSdkMessage } from '@/lib/claude-usage';
import { rewriteSpiffBatch } from '@/lib/incentive-import/rewrite';
import { SPIFF_REWRITE_BATCH, type RawSpiffRow } from '@/lib/incentive-import/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured.' }, { status: 500 });
  }
  const body = (await request.json().catch(() => ({}))) as { rows?: RawSpiffRow[] };
  const rows = (body.rows ?? []).slice(0, SPIFF_REWRITE_BATCH);
  if (!rows.length) return NextResponse.json({ error: 'No rows to rewrite.' }, { status: 400 });

  try {
    const { drafts, message, maxTokens } = await rewriteSpiffBatch(client, rows);
    logClaudeUsageAsync({
      routeLabel: 'spiff-import-rewrite',
      usage: usageFromSdkMessage(message),
      maxTokens,
    });
    return NextResponse.json({ drafts });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI rewrite failed' },
      { status: 502 },
    );
  }
}
