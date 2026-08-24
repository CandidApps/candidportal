'use client';

import type { QuoteRequestRow } from '@/lib/services/quote-requests';
import { resolveQuoteServiceLabel } from '@/lib/services/quote-requests';
import { formatReviewTime } from '@/lib/services/analysis-reviews';

export function CustomerQuotesSection({
  quotes,
  onOpenQuote,
}: {
  quotes: QuoteRequestRow[];
  onOpenQuote?: (quoteRequestId: string) => void;
}) {
  if (!quotes.length) return null;

  const open = quotes.filter((q) => q.status === 'open' || q.status === 'in_progress' || q.status === 'submitted');
  const published = quotes.filter((q) => q.status === 'resolved' || Boolean(q.published_quote_snapshot));

  const Row = ({ quote }: { quote: QuoteRequestRow }) => {
    const label = resolveQuoteServiceLabel(quote);
    const isPublished = Boolean(quote.published_quote_snapshot) || quote.status === 'resolved';
    return (
      <tr className="admin-tickets-row">
        <td>
          <span
            className={`admin-status-pill admin-status-pill--${isPublished ? 'resolved' : 'open'}`}
          >
            {isPublished ? 'Published' : quote.status === 'in_progress' ? 'In progress' : 'Open'}
          </span>
        </td>
        <td>
          <div style={{ fontWeight: 600, color: 'var(--gray-dark)' }}>{label}</div>
          <div style={{ fontSize: 12, color: 'var(--gray)' }}>
            {quote.subject || quote.company || 'Quote request'}
          </div>
        </td>
        <td className="admin-ticket-time">
          {formatReviewTime(quote.published_at || quote.updated_at || quote.created_at)}
        </td>
        <td style={{ textAlign: 'right' }}>
          {onOpenQuote ? (
            <button
              type="button"
              className="admin-ticket-btn primary"
              onClick={() => onOpenQuote(quote.id)}
            >
              {isPublished ? 'Open quote' : 'Continue'}
            </button>
          ) : null}
        </td>
      </tr>
    );
  };

  return (
    <div style={{ marginBottom: 20 }}>
      {open.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">Open quotes</div>
          </div>
          <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="admin-tickets-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Service</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {open.map((q) => (
                  <Row key={q.id} quote={q} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {published.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Published quotes &amp; proposals</div>
          </div>
          <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="admin-tickets-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Service</th>
                  <th>Published</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {published.map((q) => (
                  <Row key={q.id} quote={q} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
