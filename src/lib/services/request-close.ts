/** Close / cancel / reopen for quote requests and bill analyses (CR-0090). Client + server safe. */

export type ClosableRequestKind = 'quote' | 'analysis';
export type CloseRequestAction = 'close' | 'cancel' | 'reopen';
export type ClosedRequestStatus = 'closed' | 'cancelled';

export const CLOSED_REQUEST_STATUSES: readonly ClosedRequestStatus[] = ['closed', 'cancelled'];

/** PostgREST `not.in` filter value for excluding closed/cancelled rows. */
export const CLOSED_STATUS_FILTER = '(closed,cancelled)';

export type ClosedRequestFields = {
  closed_at?: string | null;
  closed_by_email?: string | null;
  close_reason?: string | null;
};

export function isClosedRequestStatus(status: string | null | undefined): status is ClosedRequestStatus {
  return status === 'closed' || status === 'cancelled';
}

export function closedRequestLabel(status: ClosedRequestStatus): string {
  return status === 'cancelled' ? 'Cancelled' : 'Closed';
}

/** "Cancelled Sep 29 by bryan@… — duplicate" */
export function closedRequestSummary(row: ClosedRequestFields & { status: string }): string {
  if (!isClosedRequestStatus(row.status)) return '';
  const when = row.closed_at
    ? new Date(row.closed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '';
  const who = row.closed_by_email?.trim();
  return [
    [closedRequestLabel(row.status), when].filter(Boolean).join(' '),
    who ? `by ${who}` : '',
  ]
    .filter(Boolean)
    .join(' ')
    .concat(row.close_reason?.trim() ? ` — ${row.close_reason.trim()}` : '');
}

export type ClosedAccountRequests<Q, A> = { quotes: Q[]; analyses: A[] };

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? res.statusText;
}

/** Admin: close, cancel, or reopen one or more quote requests / analyses. */
export async function applyRequestCloseAction(input: {
  kind: ClosableRequestKind;
  ids: string[];
  action: CloseRequestAction;
  reason?: string;
}): Promise<{ updated: number }> {
  const res = await fetch('/api/admin/requests/close', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as { updated: number };
}

/** Admin: closed/cancelled quote requests and analyses for one CRM account. */
export async function fetchClosedRequestsForAccount<Q = Record<string, unknown>, A = Record<string, unknown>>(
  customerId: string,
): Promise<ClosedAccountRequests<Q, A>> {
  const res = await fetch(`/api/admin/requests/close?customerId=${encodeURIComponent(customerId)}`, {
    cache: 'no-store',
  });
  if (!res.ok) return { quotes: [], analyses: [] };
  return (await res.json()) as ClosedAccountRequests<Q, A>;
}

/** Member: their closed/cancelled quote requests and analyses. */
export async function fetchMemberClosedRequests<Q = Record<string, unknown>, A = Record<string, unknown>>(
  customerId?: string | null,
): Promise<ClosedAccountRequests<Q, A>> {
  const qs = customerId?.trim() ? `?customerId=${encodeURIComponent(customerId.trim())}` : '';
  const res = await fetch(`/api/portal/closed-requests${qs}`, { cache: 'no-store' });
  if (!res.ok) return { quotes: [], analyses: [] };
  return (await res.json()) as ClosedAccountRequests<Q, A>;
}
