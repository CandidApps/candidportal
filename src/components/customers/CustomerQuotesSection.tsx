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
import {
  ClosedRequestsCard,
  RequestBulkBar,
  RowSelectCheckbox,
  useRequestCloser,
} from '@/components/customers/RequestCloseControls';

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

const QUOTE_NOUN: [string, string] = ['quote', 'quotes'];

export function CustomerQuotesSection({
  quotes,
  closedQuotes = [],
  contractActions = [],
  onOpenQuote,
  onOpenPipelineDeal,
  onRequestsChanged,
}: {
  quotes: QuoteRequestRow[];
  closedQuotes?: QuoteRequestRow[];
  contractActions?: ContractSubmitActionRow[];
  onOpenQuote?: (quoteRequestId: string) => void;
  onOpenPipelineDeal?: (action: ContractSubmitActionRow) => void;
  /** Enables close / cancel / reopen; called after any change. */
  onRequestsChanged?: () => void;
}) {
  const closer = useRequestCloser('quote', onRequestsChanged);
  const canClose = Boolean(onRequestsChanged);
  if (!quotes.length && !closedQuotes.length) return null;

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

  const Row = ({ quote, selectable = false }: { quote: QuoteRequestRow; selectable?: boolean }) => {
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

    const closable = canClose && selectable;

    return (
      <tr className="admin-tickets-row">
        {canClose ? (
          selectable ? (
            <RowSelectCheckbox
              checked={closer.selected.has(quote.id)}
              label={label}
              onToggle={() => closer.toggle(quote.id)}
            />
          ) : (
            <td className="req-select-cell" />
          )
        ) : null}
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
          <span className="req-row-actions">
            {closable ? (
              <button type="button" className="admin-ticket-btn" onClick={() => closer.openDialog([quote.id])}>
                Close…
              </button>
            ) : null}
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
          </span>
        </td>
      </tr>
    );
  };

  const selectedIds = [...closer.selected];
  const selectCol = canClose ? <th className="req-select-cell" /> : null;

  return (
    <div style={{ marginBottom: 20 }}>
      {canClose ? (
        <RequestBulkBar
          count={selectedIds.length}
          noun={QUOTE_NOUN}
          onCloseOrCancel={() => closer.openDialog(selectedIds)}
          onCancelDuplicates={() => closer.openDialog(selectedIds, 'cancel')}
          onClear={closer.clearSelection}
        />
      ) : null}
      {activePipeline.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">Quote &amp; contract pipeline</div>
          </div>
          <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="admin-tickets-table">
              <thead>
                <tr>
                  {selectCol}
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
                  {selectCol}
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
                  {selectCol}
                  <th>Status</th>
                  <th>Service</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {open.map((q) => (
                  <Row key={q.id} quote={q} selectable />
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
                  {selectCol}
                  <th>Status</th>
                  <th>Service</th>
                  <th>Published</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {published.map((q) => (
                  <Row key={q.id} quote={q} selectable />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <ClosedRequestsCard
        title="Closed & cancelled quotes"
        rows={closedQuotes}
        renderName={(q) => q.subject || resolveQuoteServiceLabel(q)}
        reopening={closer.reopening}
        onReopen={canClose ? (id) => void closer.reopen(id) : undefined}
      />
      {closer.dialog}
    </div>
  );
}
