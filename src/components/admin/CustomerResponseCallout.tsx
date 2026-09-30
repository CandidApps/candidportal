'use client';

import {
  isModificationPending,
  QUOTE_RESPONSE_PAST,
  type QuoteCustomerResponse,
} from '@/lib/quotes/customer-response';

/** Admin view of the member's Decline / Request modification / Cancel, with their reasons. */
export function CustomerResponseCallout({
  response,
  publishedAt,
  style,
}: {
  response: QuoteCustomerResponse | null | undefined;
  /** quote_requests.published_at or bill_analysis_reviews.submitted_at */
  publishedAt: string | null | undefined;
  style?: React.CSSProperties;
}) {
  if (!response) return null;
  const pending = isModificationPending(response, publishedAt);
  if (response.action === 'request_changes' && !pending) return null;

  return (
    <div
      className={`msp-callout ${pending ? 'msp-callout--warn' : 'msp-callout--info'}`}
      style={{ marginBottom: 16, textAlign: 'left', ...style }}
    >
      <strong>
        {pending ? 'Customer requested a modification — revise and republish' : QUOTE_RESPONSE_PAST[response.action]}
      </strong>
      {' · '}
      {new Date(response.at).toLocaleString()}
      {response.byEmail ? ` · ${response.byEmail}` : ''}
      {response.reasons.length ? (
        <div style={{ marginTop: 8 }}>Reasons: {response.reasons.join(', ')}</div>
      ) : null}
      {response.details ? (
        <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>Details: {response.details}</div>
      ) : null}
    </div>
  );
}
