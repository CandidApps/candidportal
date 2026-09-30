'use client';

import type { BillAnalysisReviewRow } from '@/lib/bill-parse-types';
import {
  analysisReviewCategoriesLabel,
  analysisReviewStatusLabel,
} from '@/lib/crm/customer-lookup';
import { formatReviewTime } from '@/lib/services/analysis-reviews';
import {
  ClosedRequestsCard,
  RequestBulkBar,
  RowSelectCheckbox,
  useRequestCloser,
} from '@/components/customers/RequestCloseControls';

const ANALYSIS_NOUN: [string, string] = ['analysis', 'analyses'];

export function CustomerAnalysisSection({
  reviews,
  closedReviews = [],
  onOpenReview,
  onRequestsChanged,
}: {
  reviews: BillAnalysisReviewRow[];
  closedReviews?: BillAnalysisReviewRow[];
  onOpenReview?: (reviewId: string) => void;
  /** Enables close / cancel / reopen; called after any change. */
  onRequestsChanged?: () => void;
}) {
  const closer = useRequestCloser('analysis', onRequestsChanged);
  const canClose = Boolean(onRequestsChanged);
  if (!reviews.length && !closedReviews.length) return null;

  const active = reviews.filter((r) => r.status === 'pending_review' || r.status === 'in_progress');
  const published = reviews.filter((r) => r.status === 'published');
  const selectedIds = [...closer.selected];
  const selectCol = canClose ? <th className="req-select-cell" /> : null;

  const Row = ({ review }: { review: BillAnalysisReviewRow }) => {
    const hasProposal = Boolean(
      review.published_snapshot?.proposalDocument ?? review.draft_snapshot?.proposalDocument,
    );
    const hasMerchant = Boolean(review.published_snapshot?.merchantAnalysis ?? review.draft_snapshot?.merchantAnalysis);
    const deliverable =
      review.status === 'published'
        ? hasProposal
          ? 'Proposal document'
          : hasMerchant
            ? 'Merchant analysis'
            : 'Analysis'
        : 'Awaiting admin review';
    const accepted = Boolean(review.customer_accepted_at);

    return (
      <tr className="admin-tickets-row">
        {canClose ? (
          accepted ? (
            <td className="req-select-cell" />
          ) : (
            <RowSelectCheckbox
              checked={closer.selected.has(review.id)}
              label={review.vendor_name}
              onToggle={() => closer.toggle(review.id)}
            />
          )
        ) : null}
        <td>
          <span className={`admin-status-pill admin-status-pill--${review.status === 'published' ? 'resolved' : 'open'}`}>
            {analysisReviewStatusLabel(review.status)}
          </span>
        </td>
        <td>
          <div style={{ fontWeight: 600, color: 'var(--gray-dark)' }}>{review.vendor_name}</div>
          <div style={{ fontSize: 12, color: 'var(--gray)' }}>{analysisReviewCategoriesLabel(review)}</div>
        </td>
        <td style={{ fontSize: 12, color: 'var(--gray)' }}>{deliverable}</td>
        <td className="admin-ticket-time">{formatReviewTime(review.created_at)}</td>
        <td style={{ textAlign: 'right' }}>
          <span className="req-row-actions">
            {canClose && !accepted ? (
              <button type="button" className="admin-ticket-btn" onClick={() => closer.openDialog([review.id])}>
                Close…
              </button>
            ) : null}
            {onOpenReview ? (
              <button type="button" className="admin-ticket-btn primary" onClick={() => onOpenReview(review.id)}>
                {review.status === 'published' ? 'View as customer' : 'Review'}
              </button>
            ) : null}
          </span>
        </td>
      </tr>
    );
  };

  return (
    <div style={{ marginBottom: 20 }}>
      {canClose ? (
        <RequestBulkBar
          count={selectedIds.length}
          noun={ANALYSIS_NOUN}
          onCloseOrCancel={() => closer.openDialog(selectedIds)}
          onCancelDuplicates={() => closer.openDialog(selectedIds, 'cancel')}
          onClear={closer.clearSelection}
        />
      ) : null}
      {active.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">Analysis requests</div>
          </div>
          <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="admin-tickets-table">
              <thead>
                <tr>
                  {selectCol}
                  <th>Status</th>
                  <th>Vendor / category</th>
                  <th>Type</th>
                  <th>Submitted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {active.map((review) => (
                  <Row key={review.id} review={review} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {published.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Published analyses & proposals</div>
          </div>
          <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="admin-tickets-table">
              <thead>
                <tr>
                  {selectCol}
                  <th>Status</th>
                  <th>Vendor / category</th>
                  <th>Deliverable</th>
                  <th>Published</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {published.map((review) => (
                  <Row key={review.id} review={review} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <ClosedRequestsCard
        title="Closed & cancelled analyses"
        rows={closedReviews}
        renderName={(r) => r.vendor_name}
        reopening={closer.reopening}
        onReopen={canClose ? (id) => void closer.reopen(id) : undefined}
      />
      {closer.dialog}
    </div>
  );
}
