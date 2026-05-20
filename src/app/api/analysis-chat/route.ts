import { NextResponse } from 'next/server';
import type { MerchantAnalysisSnapshot } from '@/lib/candid-pay/merchant-analysis';

const TICKET_TAG = '[SUGGEST_TICKET]';

function buildAnalysisSystemPrompt(ctx: MerchantAnalysisSnapshot): string {
  const f = ctx.form;
  const stmts = ctx.statements ?? [];
  const latest = stmts[stmts.length - 1];

  return `You are Hank, Candid's AI assistant. The customer is viewing their merchant card processing statement analysis in the Candid member portal.

Answer ONLY using the analysis data below. Be concise (2–4 short paragraphs max), merchant-voice ("you" / "we"), and use <strong> for key dollar amounts and rates.

Never mention PayCosmos, Linked2Pay, processor buy rates, agent margins, Schedule A, or internal profitability.

If the question cannot be answered from this analysis (needs contract review, legal advice, account changes, billing dispute with processor, or anything requiring a human specialist), give a brief helpful reply and end your message with exactly this tag on its own line: ${TICKET_TAG}

CURRENT ANALYSIS:
- Merchant: ${f.merchantName || 'Unknown'}
- Statement period: ${f.statementPeriod || latest?.statementDate || 'N/A'}
- Monthly CC volume: $${f.ccVolume || '0'}
- Effective rate: ${f.currentEffectiveRate || '0'}%
- Pricing model: ${f.pricingModel || 'unknown'}
- Markup above interchange (bps): ${f.currentMarkupBps || 'N/A'}
- BASC STAND/mo: $${f.bascStand || '0'}
- STMT MAIL/mo: $${f.stmtMail || '0'}
- Non-qual fee/mo: $${f.nonQualFee || '0'}
- Transactions/mo: ${f.transactionCount || 'N/A'}`;
}

type ChatMessage = { role: string; content: string };

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'AI assistant is not configured' }, { status: 503 });
  }

  let body: { messages?: ChatMessage[]; analysisContext?: MerchantAnalysisSnapshot };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const analysisContext = body.analysisContext;
  if (!analysisContext?.form) {
    return NextResponse.json({ error: 'analysisContext required' }, { status: 400 });
  }

  const raw = body.messages ?? [];
  const messages = raw
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: String(m.content ?? ''),
    }))
    .filter((m) => m.content.length > 0);

  if (messages.length === 0) {
    return NextResponse.json({ error: 'messages required' }, { status: 400 });
  }

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
        max_tokens: 800,
        system: buildAnalysisSystemPrompt(analysisContext),
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[analysis-chat] Anthropic error:', response.status, errText);
      return NextResponse.json({ error: 'Upstream API error' }, { status: response.status });
    }

    const data = (await response.json()) as {
      content?: { type: string; text?: string }[];
    };

    const parts: string[] = [];
    for (const block of data.content ?? []) {
      if (block?.type === 'text' && typeof block.text === 'string') {
        parts.push(block.text);
      }
    }

    const rawText = parts.join('\n\n').trim();
    const suggestTicket = rawText.includes(TICKET_TAG);
    const text = rawText.replace(TICKET_TAG, '').trim();

    return NextResponse.json({
      text:
        text ||
        "I'm having trouble with that one. A Candid specialist can help — use Open a ticket below.",
      suggestTicket,
    });
  } catch (e) {
    console.error('[analysis-chat]', e);
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}
