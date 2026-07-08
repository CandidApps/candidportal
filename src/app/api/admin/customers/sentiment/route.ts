import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { askHankServer } from '@/lib/hank/server';
import { searchConversation } from '@/lib/email/zoho';
import {
  getActiveConnectionForUser,
  getActiveSharedConnection,
} from '@/lib/email/zoho-connections';
import type { CustomerSentiment, SentimentLevel } from '@/lib/crm/customer-sentiment';

export const dynamic = 'force-dynamic';

const STALE_MS = 12 * 60 * 60 * 1000;
const LEVEL_RANK: Record<SentimentLevel, number> = {
  good: 0,
  neutral: 1,
  at_risk: 2,
  urgent: 3,
  unknown: -1,
};

function worse(a: SentimentLevel, b: SentimentLevel): SentimentLevel {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

function mapRow(row: Record<string, unknown> | null): CustomerSentiment | null {
  if (!row) return null;
  return {
    level: (row.level as SentimentLevel) ?? 'unknown',
    headline: String(row.headline ?? ''),
    signals: Array.isArray(row.signals) ? (row.signals as string[]) : [],
    lastContactAt: (row.last_contact_at as string | null) ?? null,
    awaitingReply: Boolean(row.awaiting_reply),
    generatedAt: (row.generated_at as string | null) ?? null,
  };
}

function daysAgo(ms: number): number {
  return Math.floor((Date.now() - ms) / 86_400_000);
}

function extractJson(text: string): Record<string, unknown> | null {
  let t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) t = fenced[1].trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s !== -1 && e !== -1 && e > s) {
    try {
      return JSON.parse(t.slice(s, e + 1)) as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const customerId = new URL(request.url).searchParams.get('customerId')?.trim();
  if (!customerId) return NextResponse.json({ error: 'Missing customerId' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from('customer_sentiment')
    .select('*')
    .eq('customer_id', customerId)
    .maybeSingle();

  const sentiment = mapRow(data as Record<string, unknown> | null);
  const stale =
    !sentiment ||
    !sentiment.generatedAt ||
    Date.now() - new Date(sentiment.generatedAt).getTime() > STALE_MS;
  return NextResponse.json({ sentiment, stale });
}

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as {
    customerId?: string;
    email?: string;
    customerName?: string;
  };
  const customerId = body.customerId?.trim();
  const email = body.email?.trim().toLowerCase() ?? '';
  const customerName = body.customerName?.trim() ?? '';
  if (!customerId) return NextResponse.json({ error: 'Missing customerId' }, { status: 400 });

  const admin = createSupabaseAdminClient();

  // No contact email → can't read the relationship from mail.
  if (!email) {
    const sentiment: CustomerSentiment = {
      level: 'unknown',
      headline: 'No contact email on file to read the relationship.',
      signals: ['Add a primary contact email to track sentiment.'],
      lastContactAt: null,
      awaitingReply: false,
      generatedAt: new Date().toISOString(),
    };
    await persist(admin, customerId, sentiment);
    return NextResponse.json({ sentiment });
  }

  const connection =
    (await getActiveConnectionForUser(user.id)) ?? (await getActiveSharedConnection());
  if (!connection) {
    const sentiment: CustomerSentiment = {
      level: 'unknown',
      headline: 'Connect a mailbox to read relationship sentiment.',
      signals: [],
      lastContactAt: null,
      awaitingReply: false,
      generatedAt: new Date().toISOString(),
    };
    return NextResponse.json({ sentiment });
  }

  let messages;
  try {
    messages = await searchConversation({
      accessToken: connection.accessToken,
      accountId: connection.accountId,
      email,
      limit: 30,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not read mailbox' },
      { status: 502 },
    );
  }

  // Direction: a message FROM the customer's address is inbound; otherwise it's
  // something we (Candid) sent.
  let lastInbound = 0;
  let lastOutbound = 0;
  for (const m of messages) {
    const inbound = m.fromAddress.trim().toLowerCase().includes(email);
    if (inbound) lastInbound = Math.max(lastInbound, m.receivedTime);
    else lastOutbound = Math.max(lastOutbound, m.receivedTime);
  }
  const lastContact = Math.max(lastInbound, lastOutbound);
  const awaitingReply = lastInbound > 0 && lastInbound > lastOutbound;

  // ── Heuristic signals (deterministic, always reliable) ──
  const signals: string[] = [];
  let level: SentimentLevel = messages.length ? 'good' : 'unknown';

  if (!messages.length) {
    signals.push('No email history found with this contact.');
  } else {
    const contactDays = daysAgo(lastContact);
    if (contactDays >= 60) {
      signals.push(`No contact in ${contactDays} days — relationship going cold.`);
      level = worse(level, 'at_risk');
    } else if (contactDays >= 30) {
      signals.push(`Last contact ${contactDays} days ago.`);
      level = worse(level, 'neutral');
    }

    if (awaitingReply) {
      const waitDays = daysAgo(lastInbound);
      if (waitDays >= 3) {
        signals.push(`They're waiting ${waitDays} days for our reply.`);
        level = worse(level, 'urgent');
      } else if (waitDays >= 1) {
        signals.push(`Awaiting our reply (${waitDays}d).`);
        level = worse(level, 'at_risk');
      } else {
        signals.push('Awaiting our reply.');
        level = worse(level, 'neutral');
      }
    }
  }

  // ── AI read on tone of recent messages ──
  let headline = '';
  if (messages.length) {
    const thread = messages
      .slice(0, 12)
      .map((m) => {
        const inbound = m.fromAddress.trim().toLowerCase().includes(email);
        const when = new Date(m.receivedTime).toISOString().slice(0, 10);
        return `[${when}] ${inbound ? 'THEM' : 'US'}: ${m.subject} — ${m.summary.slice(0, 160)}`;
      })
      .join('\n');

    try {
      const raw = await askHankServer(
        [
          {
            role: 'user',
            content: `You analyze a B2B customer email thread for relationship health (like an AI contact center). The customer is ${customerName || email}.

Recent messages (newest first), THEM = customer, US = our team:
${thread}

Return ONLY JSON:
{"level":"good|neutral|at_risk|urgent","headline":"one short sentence summarizing the relationship tone right now","signals":["0-3 short specific flags like 'frustrated about billing' or 'happy with savings'"]}

Judge tone: frustration, complaints, urgency, or anger => at_risk or urgent. Warmth, thanks, momentum => good. Be specific, never invent facts.`,
          },
        ],
        { systemPrompt: 'You output only valid JSON. No prose, no code fences.', maxTokens: 400, routeLabel: 'customer-sentiment' },
      );
      const parsed = extractJson(raw);
      if (parsed) {
        const aiLevel = String(parsed.level ?? '') as SentimentLevel;
        if (['good', 'neutral', 'at_risk', 'urgent'].includes(aiLevel)) {
          level = worse(level, aiLevel);
        }
        headline = String(parsed.headline ?? '');
        if (Array.isArray(parsed.signals)) {
          for (const s of parsed.signals.slice(0, 3)) {
            const text = String(s).trim();
            if (text && !signals.includes(text)) signals.push(text);
          }
        }
      }
    } catch {
      /* AI optional — heuristics still stand */
    }
  }

  if (!headline) {
    headline = messages.length
      ? awaitingReply
        ? 'They reached out and are waiting on us.'
        : 'Conversation is steady.'
      : 'No recent email activity with this contact.';
  }

  const sentiment: CustomerSentiment = {
    level,
    headline,
    signals: signals.slice(0, 5),
    lastContactAt: lastContact ? new Date(lastContact).toISOString() : null,
    awaitingReply,
    generatedAt: new Date().toISOString(),
  };

  await persist(admin, customerId, sentiment, {
    lastInbound,
    lastOutbound,
  });

  return NextResponse.json({ sentiment });
}

async function persist(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  customerId: string,
  s: CustomerSentiment,
  extra?: { lastInbound: number; lastOutbound: number },
) {
  await admin.from('customer_sentiment').upsert(
    {
      customer_id: customerId,
      level: s.level,
      headline: s.headline,
      signals: s.signals,
      last_contact_at: s.lastContactAt,
      last_inbound_at: extra?.lastInbound ? new Date(extra.lastInbound).toISOString() : null,
      last_outbound_at: extra?.lastOutbound ? new Date(extra.lastOutbound).toISOString() : null,
      awaiting_reply: s.awaitingReply,
      generated_at: s.generatedAt ?? new Date().toISOString(),
    },
    { onConflict: 'customer_id' },
  );
}
