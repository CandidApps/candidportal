import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getMyRole } from '@/lib/auth/roles';
import {
  enrichScheduleALine,
  parseScheduleLineMetadataFromRow,
} from '@/lib/schedule-a-line-metadata';
import {
  inferResellerLineKind,
  isResellerCompensationSection,
  normalizeScheduleASection,
  type ResellerLineKind,
  type ScheduleARateLine,
} from '@/lib/schedule-a-types';
import { logClaudeUsageAsync, usageFromSdkMessage } from '@/lib/claude-usage';

export const maxDuration = 120;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MAX_BYTES = 12 * 1024 * 1024;

const SCHEDULE_A_PROMPT = `You analyze payment processor / ISO Schedule A documents (merchant services buy-rate schedules).

Extract every pricing line item you can verify from the document. Return ONLY valid JSON — no markdown.

{
  "summary": string|null,
  "lines": [
    {
      "section": string,
      "item": string,
      "buyRate": string,
      "revenueShare": string|null,
      "notes": string|null,
      "feeOccurrence": "per_transaction"|"per_month"|"per_year"|"per_occurrence"|"per_call"|"per_volume"|null,
      "feeAppliedOn": ("app"|"credit_card"|"debit_card"|"ach"|"rdc"|"other")[]|null,
      "tierApplied": ("mid_risk"|"high_risk")[]|null
    }
  ]
}

Rules:
- section: group name such as "Card Processing", "ACH / eCheck", "Monthly Fees", "Per-Item Fees", "Chargebacks", "Risk", or "Reseller Compensation Tiers and Fees" for revenue-share tiers and partner pass-through fees.
- item: the fee or rate name exactly as shown (e.g. "Interchange Markup", "Authorization Fee", "PCI Compliance").
- buyRate: the buy rate / cost as shown (e.g. "2 bps", "0.0215", "$0.03", "$2.99/mo"). Keep units in the string.
- revenueShare: agent/partner revenue share if stated (e.g. "85%", "Revenue Share: Yes"), else null.
- notes: qualifiers, thresholds, or footnotes for that line, else null.
- feeOccurrence: how often charged — per_transaction, per_month, per_year, per_occurrence, per_call, or per_volume.
- feeAppliedOn: array of products/channels — app, credit_card, debit_card, ach, rdc, other (multi-select).
- tierApplied: array when fee only applies at medium or high risk — mid_risk, high_risk (empty/null = all tiers).
- resellerLineKind: for Reseller Compensation Tiers and Fees only — "compensation_tier" for revenue-share tier rows, "partner_fee" for partner pass-through fees with dollar amounts.
- Include monthly, per-transaction, bps, and percentage items.
- Do not invent rates. If the document is not a Schedule A or has no readable rates, return { "summary": "No Schedule A rates found", "lines": [] }.`;

function guessMediaType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
}

function parseLines(raw: unknown): ScheduleARateLine[] {
  if (!Array.isArray(raw)) return [];
  const lines: ScheduleARateLine[] = [];
  raw.forEach((row, idx) => {
    if (!row || typeof row !== 'object') return;
    const r = row as Record<string, unknown>;
    const item = String(r.item ?? r.name ?? r.fee ?? '').trim();
    const buyRate = String(r.buyRate ?? r.rate ?? r.cost ?? '').trim();
    if (!item && !buyRate) return;
    const section = normalizeScheduleASection(String(r.section ?? r.category ?? 'General'));
    const metadata = parseScheduleLineMetadataFromRow(r);
    let resellerLineKind: ResellerLineKind | undefined;
    if (typeof r.resellerLineKind === 'string') {
      const kind = r.resellerLineKind.trim().toLowerCase();
      if (kind === 'compensation_tier' || kind === 'partner_fee') resellerLineKind = kind;
    }
    const draft: ScheduleARateLine = {
      id: `parsed-${idx}-${Math.random().toString(36).slice(2, 8)}`,
      section,
      item: item || 'Line item',
      buyRate,
      revenueShare: r.revenueShare != null ? String(r.revenueShare).trim() : undefined,
      notes: r.notes != null ? String(r.notes).trim() : undefined,
      ...metadata,
      ...(resellerLineKind ? { resellerLineKind } : {}),
    };
    if (isResellerCompensationSection(section) && !draft.resellerLineKind) {
      draft.resellerLineKind = inferResellerLineKind(draft);
    }
    lines.push(enrichScheduleALine(draft));
  });
  return lines;
}

function extractJsonPayload(text: string): { lines?: unknown; summary?: string | null } {
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(clean) as { lines?: unknown; summary?: string | null };
  } catch {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(clean.slice(start, end + 1)) as { lines?: unknown; summary?: string | null };
    }
    throw new Error('Model returned invalid JSON');
  }
}

async function loadUpload(request: Request): Promise<{
  data: string;
  mediaType: string;
  filename?: string;
} | NextResponse> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File is too large. Please upload a PDF under 12 MB.' }, { status: 413 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    return {
      data: buffer.toString('base64'),
      mediaType: file.type || guessMediaType(file.name),
      filename: file.name,
    };
  }

  const body = (await request.json()) as {
    data?: string;
    mediaType?: string;
    filename?: string;
  };

  if (!body.data || !body.mediaType) {
    return NextResponse.json({ error: 'No document data provided' }, { status: 400 });
  }

  const byteLength = Buffer.byteLength(body.data, 'base64');
  if (byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'File is too large. Please upload a PDF under 12 MB.' }, { status: 413 });
  }

  return {
    data: body.data,
    mediaType: body.mediaType,
    filename: body.filename,
  };
}

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'Document parsing is not configured.' }, { status: 503 });
    }

    const loaded = await loadUpload(request);
    if (loaded instanceof NextResponse) return loaded;

    const { data, mediaType, filename } = loaded;
    const isPdf = mediaType === 'application/pdf' || filename?.toLowerCase().endsWith('.pdf');
    const isImage = mediaType.startsWith('image/');

    if (!isPdf && !isImage) {
      return NextResponse.json(
        { error: 'Upload a PDF or image Schedule A (.pdf, .png, .jpg)' },
        { status: 400 },
      );
    }

    const resolvedMediaType = isPdf ? 'application/pdf' : mediaType;

    const content: Anthropic.MessageCreateParams['messages'][0]['content'] = [
      isPdf
        ? {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data },
          }
        : {
            type: 'image',
            source: {
              type: 'base64',
              media_type: resolvedMediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data,
            },
          },
      {
        type: 'text',
        text: `${SCHEDULE_A_PROMPT}\n\nFilename: ${filename ?? 'schedule-a.pdf'}`,
      },
    ];

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content }],
    });

    logClaudeUsageAsync({
      routeLabel: 'parse-schedule-a',
      usage: usageFromSdkMessage(message),
      maxTokens: 4096,
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No response from model' }, { status: 500 });
    }

    const parsed = extractJsonPayload(textBlock.text);
    const lines = parseLines(parsed.lines);

    return NextResponse.json({
      lines,
      summary: parsed.summary ?? undefined,
    });
  } catch (err) {
    console.error('[parse-schedule-a]', err);
    const message =
      err instanceof Error && err.message.includes('invalid JSON')
        ? 'Could not read rates from the model response. Try again or add lines manually.'
        : err instanceof Anthropic.APIError
          ? `AI parsing failed: ${err.message}`
          : 'Schedule A parsing failed. Try a clearer PDF.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
