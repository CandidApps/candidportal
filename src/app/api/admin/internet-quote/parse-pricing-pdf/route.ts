import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { applyMatchScores, internetSnapshotFromDraft } from '@/lib/internet/internet-quote-snapshot';
import {
  extractPdfText,
  parseScoutPricingPdfText,
  supplierNameFromPricingFilename,
} from '@/lib/internet/scout-pricing-text-parse';
import type { PublishedQuoteSnapshot } from '@/lib/quotes/types';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { mapQuoteRequestRow, type QuoteRequestDbRow } from '@/lib/services/quote-requests';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get('file');
  const quoteRequestId = String(form.get('quoteRequestId') ?? '').trim();
  const serviceAddress = String(form.get('serviceAddress') ?? '').trim();
  let supplierName = String(form.get('supplierName') ?? '').trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }
  if (!quoteRequestId) {
    return NextResponse.json({ error: 'quoteRequestId is required' }, { status: 400 });
  }
  if (!supplierName) supplierName = supplierNameFromPricingFilename(file.name);

  const buffer = Buffer.from(await file.arrayBuffer());
  let text = '';
  try {
    text = await extractPdfText(buffer);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not read PDF' },
      { status: 400 },
    );
  }

  const option = parseScoutPricingPdfText(text, {
    supplierName,
    serviceAddress,
    pdfFilename: file.name,
  });

  const admin = createSupabaseAdminClient();
  const { data: row, error: loadErr } = await admin
    .from('quote_requests')
    .select('*')
    .eq('id', quoteRequestId)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Quote request not found' }, { status: 404 });

  const draft = (row.draft_quote_snapshot as PublishedQuoteSnapshot | null) ?? {
    serviceTypeId: 'internet',
    serviceLabel: 'Internet / Broadband',
    quotePath: 'manual' as const,
  };
  const base = internetSnapshotFromDraft(draft, mapQuoteRequestRow(row as QuoteRequestDbRow));
  const pricingOptions = applyMatchScores([...base.pricingOptions, option], base.requirements);
  const internetQuote = {
    ...base,
    pricingOptions,
    workflowStage: 'pricing_review' as const,
  };
  const nextDraft: PublishedQuoteSnapshot = { ...draft, internetQuote };

  const { error: updErr } = await admin
    .from('quote_requests')
    .update({
      draft_quote_snapshot: nextDraft,
      updated_at: new Date().toISOString(),
    })
    .eq('id', quoteRequestId);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, option });
}
