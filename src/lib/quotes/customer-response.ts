/** Member Decline / Request modification / Cancel on quotes and analyses (CR-0090). Client + server safe. */

export type QuoteResponseAction = 'decline' | 'request_changes' | 'cancel';
export type QuoteResponseTarget = { quoteRequestId?: string | null; analysisReviewId?: string | null };

export type QuoteCustomerResponse = {
  action: QuoteResponseAction;
  reasons: string[];
  details: string | null;
  at: string;
  byEmail: string | null;
};

/** Window event fired after a member declines / requests changes / cancels, so quote lists refresh. */
export const QUOTE_RESPONSE_EVENT = 'candid-quote-response';

export const QUOTE_RESPONSE_ACTIONS: readonly QuoteResponseAction[] = ['decline', 'request_changes', 'cancel'];

export const QUOTE_RESPONSE_LABEL: Record<QuoteResponseAction, string> = {
  decline: 'Decline',
  request_changes: 'Request modification',
  cancel: 'Cancel',
};

export const QUOTE_RESPONSE_PAST: Record<QuoteResponseAction, string> = {
  decline: 'Declined by customer',
  request_changes: 'Modification requested by customer',
  cancel: 'Cancelled by customer',
};

export const QUOTE_RESPONSE_REASONS: Record<QuoteResponseAction, readonly string[]> = {
  decline: [
    'Price is too high',
    'Staying with current provider',
    'Went with another provider',
    'Contract terms don’t work',
    'Missing features we need',
    'Timing isn’t right',
  ],
  request_changes: [
    'Lower the price',
    'Different contract length',
    'Add or remove services',
    'Change quantities or users',
    'Different provider',
    'Different install / start date',
  ],
  cancel: [
    'No longer needed',
    'Submitted by mistake',
    'Duplicate request',
    'Business changes (moving, closing, merging)',
    'Handling it ourselves',
  ],
};

export function isQuoteResponseAction(v: unknown): v is QuoteResponseAction {
  return typeof v === 'string' && (QUOTE_RESPONSE_ACTIONS as readonly string[]).includes(v);
}

export function parseQuoteCustomerResponse(raw: unknown): QuoteCustomerResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isQuoteResponseAction(r.action) || typeof r.at !== 'string') return null;
  return {
    action: r.action,
    reasons: Array.isArray(r.reasons) ? r.reasons.filter((x): x is string => typeof x === 'string') : [],
    details: typeof r.details === 'string' && r.details.trim() ? r.details.trim() : null,
    at: r.at,
    byEmail: typeof r.byEmail === 'string' ? r.byEmail : null,
  };
}

/** "Price is too high, Timing isn't right — we signed a 2-year deal last month" */
export function formatQuoteResponseReason(r: Pick<QuoteCustomerResponse, 'reasons' | 'details'>): string {
  return [r.reasons.join(', '), r.details?.trim() ?? ''].filter(Boolean).join(' — ');
}

/**
 * A modification request is outstanding until Candid republishes after it.
 * `publishedAt` = quote_requests.published_at or bill_analysis_reviews.submitted_at.
 */
export function isModificationPending(
  response: QuoteCustomerResponse | null | undefined,
  publishedAt: string | null | undefined,
): boolean {
  if (response?.action !== 'request_changes') return false;
  if (!publishedAt) return true;
  return response.at > publishedAt;
}

export async function submitQuoteResponse(input: {
  target: QuoteResponseTarget;
  action: QuoteResponseAction;
  reasons: string[];
  details: string;
  customerId?: string | null;
}): Promise<QuoteCustomerResponse> {
  const res = await fetch('/api/portal/quote-response', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteRequestId: input.target.quoteRequestId || undefined,
      analysisReviewId: input.target.analysisReviewId || undefined,
      action: input.action,
      reasons: input.reasons,
      details: input.details,
      customerId: input.customerId || undefined,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; response?: QuoteCustomerResponse };
  if (!res.ok || !data.response) throw new Error(data.error ?? 'Could not send your response');
  return data.response;
}

export async function fetchQuoteResponseState(target: QuoteResponseTarget): Promise<{
  response: QuoteCustomerResponse | null;
  modificationPending: boolean;
  closed: boolean;
}> {
  const params = new URLSearchParams();
  if (target.quoteRequestId) params.set('quoteRequestId', target.quoteRequestId);
  if (target.analysisReviewId) params.set('analysisReviewId', target.analysisReviewId);
  const res = await fetch(`/api/portal/quote-response?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) return { response: null, modificationPending: false, closed: false };
  const data = (await res.json()) as { response?: unknown; modificationPending?: boolean; closed?: boolean };
  return {
    response: parseQuoteCustomerResponse(data.response),
    modificationPending: Boolean(data.modificationPending),
    closed: Boolean(data.closed),
  };
}
