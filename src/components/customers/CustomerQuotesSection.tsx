'use client';

import type { QuoteRequestRow } from '@/lib/services/quote-requests';
import {
  isQuoteRequestAccepted,
  resolveQuoteServiceLabel,
} from '@/lib/services/quote-requests';
import { formatReviewTime } from '@/lib/services/analysis-reviews';
import {
  CONTRACT_DEAL_STAGE_LABEL,
  type ContractDealStage,
  type ContractSubmitActionRow,
} from '@/lib/services/contract-submit-actions';

function pipelineDealForQuote(
  quoteId: string,
  contractActions: ContractSubmitActionRow[],
): ContractSubmitActionRow | null {
  return (
    contractActions.find(
      (a) => a.quote_request_id === quoteId && a.status !== 'converted',
    ) ?? null
  );
}

function pipelineButtonLabel(stage: ContractDealStage): string {
  switch (stage) {
    case 'quote_accepted':
      return 'Submit contract';
    case 'supplier_contract_requested':
      return 'Continue pipeline';
    case 'supplier_contract_received':
      return 'Send to customer';
    case 'customer_contract_sent':
      return 'View contract';
    case 'customer_contract_signed':
      return 'Complete conversion';
    default:
      return 'Continue pipeline';
  }
}

function quoteStatusMeta(
  quote: QuoteRequestRow,
  deal: ContractSubmitActionRow | null,
) {
  if (deal) {
    return {
      pill: 'pipeline' as const,
      label: CONTRACT_DEAL_STAGE_LABEL[deal.status],
    };
  }
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
  contractActions = [],
  onOpenQuote,
  onOpenPipelineDeal,
}: {
  quotes: QuoteRequestRow[];
  contractActions?: ContractSubmitActionRow[];
  onOpenQuote?: (quoteRequestId: string) => void;
  onOpenPipelineDeal?: (action: ContractSubmitActionRow) => void;
}) {
  if (!quotes.length) return null;

  const activePipeline = quotes.filter((q) => {
    if (!isQuoteRequestAccepted(q)) return false;
    return Boolean(pipelineDealForQuote(q.id, contractActions));
  });
  const acceptedNoPipeline = quotes.filter(
    (q) => isQuoteRequestAccepted(q) && !pipelineDealForQuote(q.id, contractActions),
  );
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

  const Row = ({ quote }: { quote: QuoteRequestRow }) => {
    const label = resolveQuoteServiceLabel(quote);
    const deal = pipelineDealForQuote(quote.id, contractActions);
    const { pill, label: statusLabel } = quoteStatusMeta(quote, deal);
    const isPublished = Boolean(quote.published_quote_snapshot) || quote.status === 'resolved';

    const handleOpen = () => {
      if (deal && onOpenPipelineDeal) {
        onOpenPipelineDeal(deal);
        return;
      }
      onOpenQuote?.(quote.id);
    };

    return (
      <tr className="admin-tickets-row">
        <td>
          <span className={`admin-status-pill admin-status-pill--${pill}`}>{statusLabel}</span>
        </td>
        <td>
          <div style={{ fontWeight: 600, color: 'var(--gray-dark)' }}>{label}</div>
          <div style={{ fontSize: 12, color: 'var(--gray)' }}>
            {quote.subject || quote.company || 'Quote request'}
            {deal?.acceptance?.monthlyTotal != null ? (
              <>
                {' · '}
                Monthly ${deal.acceptance.monthlyTotal.toFixed(2)}
              </>
            ) : null}
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
            deal?.updated_at ||
              quote.customer_accepted_at ||
              quote.published_at ||
              quote.updated_at ||
              quote.created_at,
          )}
        </td>
        <td style={{ textAlign: 'right' }}>
          {(onOpenQuote || (deal && onOpenPipelineDeal)) ? (
            <button type="button" className="admin-ticket-btn primary" onClick={handleOpen}>
              {deal
                ? pipelineButtonLabel(deal.status)
                : isQuoteRequestAccepted(quote)
                  ? 'View acceptance'
                  : isPublished
                    ? 'Open quote'
                    : 'Continue'}
            </button>
          ) : null}
        </td>
      </tr>
    );
  };

  return (
    <div style={{ marginBottom: 20 }}>
      {activePipeline.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">Quote &amp; contract pipeline</div>
          </div>
          <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="admin-tickets-table">
              <thead>
                <tr>
                  <th>Pipeline stage</th>
                  <th>Service</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {activePipeline.map((q) => (
                  <Row key={q.id} quote={q} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {acceptedNoPipeline.length > 0 && (
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
                {acceptedNoPipeline.map((q) => (
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
