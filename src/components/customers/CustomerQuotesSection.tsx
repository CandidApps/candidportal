'use client';

import type { QuoteRequestRow } from '@/lib/services/quote-requests';
import {
  isQuoteRequestAccepted,
  resolveQuoteServiceLabel,
} from '@/lib/services/quote-requests';
import { formatReviewTime } from '@/lib/services/analysis-reviews';

function quoteStatusMeta(quote: QuoteRequestRow) {
  const accepted = isQuoteRequestAccepted(quote);
  const published = Boolean(quote.published_quote_snapshot) || quote.status === 'resolved';
  if (accepted) {
    return { pill: 'accepted' as const, label: 'Accepted' };
  }
  if (published) {
    return { pill: 'resolved' as const, label: 'Published' };
  }
  if (quote.status === 'in_progress') {
    return { pill: 'in_progress' as const, label: 'In progress' };
  }
  return { pill: 'open' as const, label: 'Open' };
}

export function CustomerQuotesSection({
  quotes,
  onOpenQuote,
}: {
  quotes: QuoteRequestRow[];
  onOpenQuote?: (quoteRequestId: string) => void;
}) {
  if (!quotes.length) return null;

  const open = quotes.filter(
    (q) =>
      !isQuoteRequestAccepted(q) &&
      (q.status === 'open' || q.status === 'in_progress' || q.status === 'submitted'),
  );
  const published = quotes.filter(
    (q) =>
      !isQuoteRequestAccepted(q) &&
      (q.status === 'resolved' || Boolean(q.published_quote_snapshot)),
  );
  const accepted = quotes.filter((q) => isQuoteRequestAccepted(q));

  const Row = ({ quote }: { quote: QuoteRequestRow }) => {
    const label = resolveQuoteServiceLabel(quote);
    const { pill, label: statusLabel } = quoteStatusMeta(quote);
    const isPublished = Boolean(quote.published_quote_snapshot) || quote.status === 'resolved';
    return (
      <tr className="admin-tickets-row">
        <td>
          <span className={`admin-status-pill admin-status-pill--${pill}`}>{statusLabel}</span>
        </td>
        <td>
          <div style={{ fontWeight: 600, color: 'var(--gray-dark)' }}>{label}</div>
          <div style={{ fontSize: 12, color: 'var(--gray)' }}>
            {quote.subject || quote.company || 'Quote request'}
            {isQuoteRequestAccepted(quote) && quote.customer_accepted_at ? (
              <>
                {' · '}
                Accepted {formatReviewTime(quote.customer_accepted_at)}
              </>
            ) : null}
          </div>
        </td>
        <td className="admin-ticket-time">
          {formatReviewTime(
            quote.customer_accepted_at ||
              quote.published_at ||
              quote.updated_at ||
              quote.created_at,
          )}
        </td>
        <td style={{ textAlign: 'right' }}>
          {onOpenQuote ? (
            <button
              type="button"
              className="admin-ticket-btn primary"
              onClick={() => onOpenQuote(quote.id)}
            >
              {isQuoteRequestAccepted(quote) ? 'View acceptance' : isPublished ? 'Open quote' : 'Continue'}
            </button>
          ) : null}
        </td>
      </tr>
    );
  };

  return (
    <div style={{ marginBottom: 20 }}>
      {accepted.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">Accepted quotes</div>
          </div>
          <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="admin-tickets-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Service</th>
                  <th>Accepted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {accepted.map((q) => (
                  <Row key={q.id} quote={q} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
