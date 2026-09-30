import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { mapReviewRow } from '@/lib/services/analysis-reviews';
import { mapQuoteRequestRow, type QuoteRequestDbRow } from '@/lib/services/quote-requests';
import { resolveContactEmailsForCustomer } from '@/lib/services/quote-request-crm-link';
import {
  CLOSED_REQUEST_STATUSES,
  isClosedRequestStatus,
  type ClosableRequestKind,
  type CloseRequestAction,
} from '@/lib/services/request-close';

export const dynamic = 'force-dynamic';

const TABLE: Record<ClosableRequestKind, 'quote_requests' | 'bill_analysis_reviews'> = {
  quote: 'quote_requests',
  analysis: 'bill_analysis_reviews',
};
const REOPEN_DEFAULT: Record<ClosableRequestKind, string> = {
  quote: 'open',
  analysis: 'pending_review',
};
const MAX_IDS = 100;

/** Closed / cancelled quote requests and analyses for one CRM account. */
export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const customerId = new URL(request.url).searchParams.get('customerId')?.trim();
  if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const emails = await resolveContactEmailsForCustomer(admin, customerId).catch(() => [] as string[]);
  const statuses = [...CLOSED_REQUEST_STATUSES];

  const [quotesRes, analysesByCrm, analysesByEmail] = await Promise.all([
    admin
      .from('quote_requests')
      .select('*')
      .eq('crm_customer_id', customerId)
      .in('status', statuses)
      .order('closed_at', { ascending: false })
      .limit(100),
    admin
      .from('bill_analysis_reviews')
      .select('*')
      .eq('crm_customer_id', customerId)
      .in('status', statuses)
      .order('closed_at', { ascending: false })
      .limit(100),
    emails.length
      ? admin
          .from('bill_analysis_reviews')
          .select('*')
          .is('crm_customer_id', null)
          .in('customer_email', emails)
          .in('status', statuses)
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const firstError = quotesRes.error ?? analysesByCrm.error ?? analysesByEmail.error;
  if (firstError) {
    // Databases without the CR-0090 migration have no closed rows to show.
    if (firstError.message.includes('closed_at')) return NextResponse.json({ quotes: [], analyses: [] });
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  const analysisRows = [...(analysesByCrm.data ?? []), ...(analysesByEmail.data ?? [])];
  const seen = new Set<string>();
  const analyses = analysisRows
    .filter((r) => {
      const id = String((r as { id: string }).id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((r) => mapReviewRow(r as Record<string, unknown>));

  return NextResponse.json({
    quotes: (quotesRes.data ?? []).map((r) => mapQuoteRequestRow(r as QuoteRequestDbRow)),
    analyses,
  });
}

/** Body: { kind: 'quote' | 'analysis', ids: string[], action: 'close' | 'cancel' | 'reopen', reason? } */
export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    kind?: unknown;
    ids?: unknown;
    action?: unknown;
    reason?: unknown;
  } | null;
  const kind = body?.kind === 'quote' || body?.kind === 'analysis' ? (body.kind as ClosableRequestKind) : null;
  const action =
    body?.action === 'close' || body?.action === 'cancel' || body?.action === 'reopen'
      ? (body.action as CloseRequestAction)
      : null;
  const ids = Array.isArray(body?.ids)
    ? [...new Set(body.ids.filter((id): id is string => typeof id === 'string' && id.trim() !== ''))]
    : [];
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

  if (!kind || !action || ids.length === 0) {
    return NextResponse.json({ error: 'kind, action, and ids are required' }, { status: 400 });
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: `At most ${MAX_IDS} items at a time` }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createSupabaseAdminClient();
  const table = TABLE[kind];
  const { data: rows, error: loadErr } = await admin
    .from(table)
    .select('id, status, status_before_close')
    .in('id', ids);
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });

  const now = new Date().toISOString();
  let updated = 0;
  for (const row of (rows ?? []) as { id: string; status: string; status_before_close: string | null }[]) {
    const closed = isClosedRequestStatus(row.status);
    let patch: Record<string, unknown>;
    if (action === 'reopen') {
      if (!closed) continue;
      const restore =
        row.status_before_close && !isClosedRequestStatus(row.status_before_close)
          ? row.status_before_close
          : REOPEN_DEFAULT[kind];
      patch = {
        status: restore,
        status_before_close: null,
        closed_at: null,
        closed_by: null,
        closed_by_email: null,
        close_reason: null,
        updated_at: now,
      };
    } else {
      if (closed) continue;
      patch = {
        status: action === 'cancel' ? 'cancelled' : 'closed',
        status_before_close: row.status,
        closed_at: now,
        closed_by: user?.id ?? null,
        closed_by_email: user?.email ?? null,
        close_reason: reason || null,
        updated_at: now,
      };
    }
    const { error } = await admin.from(table).update(patch).eq('id', row.id);
    if (error) return NextResponse.json({ error: error.message, updated }, { status: 500 });
    updated += 1;
  }

  return NextResponse.json({ updated });
}
