'use client';

import type { BillAnalysisReviewRow } from '@/lib/bill-parse-types';
import {
  analysisReviewCategoriesLabel,
  analysisReviewStatusLabel,
} from '@/lib/crm/customer-lookup';
import { formatReviewTime } from '@/lib/services/analysis-reviews';

export function CustomerAnalysisSection({
  reviews,
  onOpenReview,
}: {
  reviews: BillAnalysisReviewRow[];
  onOpenReview?: (reviewId: string) => void;
}) {
  if (!reviews.length) return null;

  const active = reviews.filter((r) => r.status === 'pending_review' || r.status === 'in_progress');
  const published = reviews.filter((r) => r.status === 'published');

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

    return (
      <tr className="admin-tickets-row">
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
          {onOpenReview ? (
            <button type="button" className="admin-ticket-btn primary" onClick={() => onOpenReview(review.id)}>
              {review.status === 'published' ? 'View' : 'Review'}
            </button>
          ) : null}
        </td>
      </tr>
    );
  };

  return (
    <div style={{ marginBottom: 20 }}>
      {active.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">Analysis requests</div>
          </div>
          <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="admin-tickets-table">
              <thead>
                <tr>
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
    </div>
  );
}
