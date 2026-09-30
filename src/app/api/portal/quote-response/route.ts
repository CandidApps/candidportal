import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  assertPortalAnalysisReviewAccess,
  assertPortalQuoteRequestAccess,
} from '@/lib/portal/quote-access';
import { isClosedRequestStatus } from '@/lib/services/request-close';
import {
  formatQuoteResponseReason,
  isModificationPending,
  isQuoteResponseAction,
  parseQuoteCustomerResponse,
  QUOTE_RESPONSE_PAST,
  type QuoteCustomerResponse,
} from '@/lib/quotes/customer-response';

export const dynamic = 'force-dynamic';

type Body = {
  quoteRequestId?: string;
  analysisReviewId?: string;
  customerId?: string;
  action?: unknown;
  reasons?: unknown;
  details?: unknown;
};

type Target = {
  table: 'quote_requests' | 'bill_analysis_reviews';
  id: string;
};

async function resolveTarget(
  user: { id: string; email?: string | null },
  quoteRequestId: string | null,
  analysisReviewId: string | null,
  customerExternalId: string | null,
): Promise<Target | { error: string; status: number }> {
  if (analysisReviewId) {
    const access = await assertPortalAnalysisReviewAccess({
      analysisReviewId,
      userId: user.id,
      email: user.email,
      customerExternalId,
    });
    if ('error' in access) return access;
    return { table: 'bill_analysis_reviews', id: analysisReviewId };
  }
  if (quoteRequestId) {
    const access = await assertPortalQuoteRequestAccess({
      quoteRequestId,
      userId: user.id,
      email: user.email,
      customerExternalId,
    });
    if ('error' in access) return access;
    return { table: 'quote_requests', id: quoteRequestId };
  }
  return { error: 'quoteRequestId or analysisReviewId required', status: 400 };
}

type LoadedRow = {
  status: string;
  published: boolean;
  publishedAt: string | null;
  acceptedAt: string | null;
  response: QuoteCustomerResponse | null;
};

async function loadRow(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  target: Target,
): Promise<LoadedRow | { error: string; status: number }> {
  const cols =
    target.table === 'quote_requests'
      ? 'status, published_quote_snapshot, published_at, customer_accepted_at, customer_response'
      : 'status, submitted_at, customer_accepted_at, customer_response';
  const { data, error } = await admin.from(target.table).select(cols).eq('id', target.id).maybeSingle();
  if (error) {
    if (/customer_response/.test(error.message)) {
      return { error: 'Quote responses need a database update. Please contact Candid.', status: 503 };
    }
    return { error: error.message, status: 500 };
  }
  if (!data) return { error: 'Not found', status: 404 };
  const row = data as unknown as Record<string, unknown>;
  const status = String(row.status ?? '');
  const isQuote = target.table === 'quote_requests';
  return {
    status,
    published: isQuote ? Boolean(row.published_quote_snapshot) : status === 'published',
    publishedAt: ((isQuote ? row.published_at : row.submitted_at) as string | null) ?? null,
    acceptedAt: (row.customer_accepted_at as string | null) ?? null,
    response: parseQuoteCustomerResponse(row.customer_response),
  };
}

/** Member's latest Decline / Request modification / Cancel on a quote or analysis. */
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const target = await resolveTarget(
    user,
    url.searchParams.get('quoteRequestId'),
    url.searchParams.get('analysisReviewId'),
    url.searchParams.get('customerId'),
  );
  if ('error' in target) return NextResponse.json({ error: target.error }, { status: target.status });

  const row = await loadRow(createSupabaseAdminClient(), target);
  if ('error' in row) return NextResponse.json({ response: null, modificationPending: false, closed: false });
  return NextResponse.json({
    response: row.response,
    modificationPending: isModificationPending(row.response, row.publishedAt),
    closed: isClosedRequestStatus(row.status),
  });
}

/** Member declines, requests a modification to, or cancels a quote request / analysis (reason required). */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!isQuoteResponseAction(body.action)) {
    return NextResponse.json({ error: 'action must be decline, request_changes, or cancel' }, { status: 400 });
  }
  const action = body.action;
  const reasons = (Array.isArray(body.reasons) ? body.reasons : [])
    .filter((r): r is string => typeof r === 'string')
    .map((r) => r.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 10);
  const details = typeof body.details === 'string' ? body.details.trim().slice(0, 1000) : '';
  if (!reasons.length && !details) {
    return NextResponse.json({ error: 'Choose a reason or tell us a bit more.' }, { status: 400 });
  }

  const target = await resolveTarget(
    user,
    body.quoteRequestId?.trim() || null,
    body.analysisReviewId?.trim() || null,
    body.customerId?.trim() || null,
  );
  if ('error' in target) return NextResponse.json({ error: target.error }, { status: target.status });

  const admin = createSupabaseAdminClient();
  const row = await loadRow(admin, target);
  if ('error' in row) return NextResponse.json({ error: row.error }, { status: row.status });

  if (row.acceptedAt) {
    return NextResponse.json(
      { error: 'This quote was already accepted. Contact Candid to make changes.' },
      { status: 409 },
    );
  }
  if (isClosedRequestStatus(row.status)) {
    return NextResponse.json({ error: 'This request is already closed.' }, { status: 409 });
  }
  if (action !== 'cancel' && !row.published) {
    return NextResponse.json({ error: 'This quote isn’t ready yet — you can cancel it instead.' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const response: QuoteCustomerResponse = {
    action,
    reasons,
    details: details || null,
    at: now,
    byEmail: user.email ?? null,
  };

  const update: Record<string, unknown> = { customer_response: response, updated_at: now };
  if (action === 'request_changes') {
    update.status = 'in_progress';
  } else {
    update.status = action === 'decline' ? 'closed' : 'cancelled';
    update.status_before_close = row.status;
    update.closed_at = now;
    update.closed_by = user.id;
    update.closed_by_email = user.email ?? null;
    update.close_reason = `${QUOTE_RESPONSE_PAST[action]}: ${formatQuoteResponseReason(response)}`;
  }

  const { error } = await admin.from(target.table).update(update).eq('id', target.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, response });
}
