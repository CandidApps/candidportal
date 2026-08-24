import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { resolveActiveMailbox } from '@/lib/email/zoho-connections';
import {
  getMessageContent,
  searchConversation,
  searchMessagesByKey,
  type ConversationMessage,
} from '@/lib/email/zoho';
import { SCOUT_RESPONSE_FROM } from '@/lib/internet/internet-quote-config';
import {
  isScoutLookupFromAddress,
  isScoutLookupSubject,
  parseScoutLookupEmailHtml,
  scoutSubjectMatchesAddress,
} from '@/lib/internet/scout-email-parse';
import { applyMatchScores, internetSnapshotFromDraft } from '@/lib/internet/internet-quote-snapshot';
import type { InternetQuoteSnapshot } from '@/lib/internet/internet-quote-types';
import type { PublishedQuoteSnapshot } from '@/lib/quotes/types';
import { mapQuoteRequestRow, type QuoteRequestDbRow } from '@/lib/services/quote-requests';

export const dynamic = 'force-dynamic';

function messageTimeMs(m: ConversationMessage): number {
  const t = m.receivedTime || m.sentTime || 0;
  // Zoho sometimes returns seconds
  return t > 0 && t < 1e12 ? t * 1000 : t;
}

function dedupeMessages(rows: ConversationMessage[]): ConversationMessage[] {
  const seen = new Set<string>();
  const out: ConversationMessage[] = [];
  for (const m of rows) {
    if (!m.messageId || seen.has(m.messageId)) continue;
    seen.add(m.messageId);
    out.push(m);
  }
  return out;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: row, error: loadErr } = await admin.from('quote_requests').select('*').eq('id', id).maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const mapped = mapQuoteRequestRow(row as QuoteRequestDbRow);
  const draft = (row.draft_quote_snapshot as PublishedQuoteSnapshot | null) ?? {
    serviceTypeId: 'internet',
    serviceLabel: 'Internet / Broadband',
    quotePath: 'manual' as const,
  };
  const base = internetSnapshotFromDraft(draft, mapped);
  if (base.workflowStage !== 'scout_pending') {
    return NextResponse.json({
      ok: true,
      status: 'already_advanced',
      workflowStage: base.workflowStage,
      internetQuote: base.scoutLookup ? base : undefined,
    });
  }

  const mailbox = await resolveActiveMailbox(user.id, 'shared_first');
  if (!mailbox.ok) {
    return NextResponse.json({
      ok: false,
      status: mailbox.reason === 'token_invalid' ? 'needs_reconnect' : 'no_mailbox',
      error: mailbox.message,
      hasLinkedMailbox: mailbox.hasLinkedMailbox,
    });
  }

  const serviceAddress = base.requirements.serviceAddress.trim();
  const sentAtMs = base.scoutRequestSentAt ? Date.parse(base.scoutRequestSentAt) : 0;
  const sinceMs = Number.isFinite(sentAtMs) && sentAtMs > 0 ? sentAtMs - 60_000 : 0;

  let messages: ConversationMessage[] = [];
  const searchErrors: string[] = [];
  try {
    const fromSender = await searchConversation({
      accessToken: mailbox.connection.accessToken,
      accountId: mailbox.connection.accountId,
      email: SCOUT_RESPONSE_FROM,
      direction: 'from',
      limit: 40,
    });
    messages.push(...fromSender);
  } catch (err) {
    searchErrors.push(err instanceof Error ? err.message : 'sender search failed');
  }
  try {
    const bySubject = await searchMessagesByKey({
      accessToken: mailbox.connection.accessToken,
      accountId: mailbox.connection.accountId,
      searchKey: 'subject:SCOUT Lookup',
      limit: 40,
    });
    messages.push(...bySubject);
  } catch (err) {
    searchErrors.push(err instanceof Error ? err.message : 'subject search failed');
  }

  messages = dedupeMessages(messages)
    .filter((m) => isScoutLookupSubject(m.subject) || isScoutLookupFromAddress(m.fromAddress))
    .filter((m) => !sinceMs || messageTimeMs(m) >= sinceMs)
    .filter((m) => scoutSubjectMatchesAddress(m.subject, serviceAddress) || isScoutLookupFromAddress(m.fromAddress))
    .sort((a, b) => messageTimeMs(b) - messageTimeMs(a));

  // Prefer address-matching subjects when available
  const addressHits = messages.filter((m) => scoutSubjectMatchesAddress(m.subject, serviceAddress));
  const candidates = addressHits.length ? addressHits : messages.filter((m) => isScoutLookupSubject(m.subject));

  if (!candidates.length) {
    return NextResponse.json({
      ok: true,
      status: 'waiting',
      mailbox: mailbox.connection.email,
      mailboxSource: mailbox.source,
      searched: messages.length,
      searchErrors: searchErrors.length ? searchErrors : undefined,
    });
  }

  const newest = candidates[0]!;
  let html = '';
  try {
    html = await getMessageContent({
      accessToken: mailbox.connection.accessToken,
      accountId: mailbox.connection.accountId,
      folderId: newest.folderId,
      messageId: newest.messageId,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      status: 'content_error',
      error: err instanceof Error ? err.message : 'Could not load SCOUT email body',
      mailbox: mailbox.connection.email,
    });
  }

  if (!html.trim()) {
    return NextResponse.json({
      ok: true,
      status: 'waiting',
      mailbox: mailbox.connection.email,
      note: 'Matched SCOUT email but body was empty',
    });
  }

  const lookup = parseScoutLookupEmailHtml(html, newest.subject);
  const internetQuote: InternetQuoteSnapshot = {
    ...base,
    scoutLookup: lookup,
    workflowStage: 'scout_received',
    pricingOptions: applyMatchScores(base.pricingOptions, base.requirements),
  };
  const nextDraft: PublishedQuoteSnapshot = { ...draft, serviceTypeId: 'internet', internetQuote };
  const { error: updErr } = await admin
    .from('quote_requests')
    .update({
      draft_quote_snapshot: nextDraft,
      service_type_id: 'internet',
      status: 'in_progress',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    status: 'ingested',
    mailbox: mailbox.connection.email,
    mailboxSource: mailbox.source,
    subject: newest.subject,
    internetQuote,
  });
}
