import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { applyMatchScores, internetSnapshotFromDraft } from '@/lib/internet/internet-quote-snapshot';
import { parseScoutLookupEmailHtml } from '@/lib/internet/scout-email-parse';
import type { InternetQuoteSnapshot, InternetScoutLookup } from '@/lib/internet/internet-quote-types';
import type { PublishedQuoteSnapshot } from '@/lib/quotes/types';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { mapQuoteRequestRow, type QuoteRequestDbRow } from '@/lib/services/quote-requests';

export const dynamic = 'force-dynamic';

type Body = {
  html?: string;
  lookup?: InternetScoutLookup;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const html = body.html?.trim();
  if (!html) return NextResponse.json({ error: 'html is required' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: row, error: loadErr } = await admin.from('quote_requests').select('*').eq('id', id).maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const lookup = body.lookup ?? parseScoutLookupEmailHtml(html);
  const draft = (row.draft_quote_snapshot as PublishedQuoteSnapshot | null) ?? {
    serviceTypeId: 'internet',
    serviceLabel: 'Internet / Broadband',
    quotePath: 'manual' as const,
  };
  const base = internetSnapshotFromDraft(draft, mapQuoteRequestRow(row as QuoteRequestDbRow));
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
  return NextResponse.json({ ok: true, internetQuote });
}
