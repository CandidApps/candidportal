'use client';

import type { PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';
import { formatCategoriesLabel } from '@/lib/provider-categories';
import { AcceptQuotePanel } from '@/components/member/AcceptQuotePanel';

export function EmbeddedProposalAnalysis({
  reviewId,
  snapshot,
  onBack,
  accountServiceId,
  contactName,
  contactEmail,
  contactPhone,
  allowAccept = true,
}: {
  reviewId: string;
  snapshot: PublishedAnalysisSnapshot;
  onBack: () => void;
  accountServiceId?: string | null;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  allowAccept?: boolean;
}) {
  const categoriesLabel =
    snapshot.categoriesLabel ??
    formatCategoriesLabel(snapshot.categories ?? [snapshot.category]);
  const proposalUrl = `/api/analysis-reviews/${reviewId}/proposal`;

  return (
    <div className="proposal-analysis-embed">
      <div className="proposal-analysis-header">
        <div>
          <div className="proposal-analysis-eyebrow">Your savings proposal</div>
          <h2 className="proposal-analysis-title">{snapshot.vendorName}</h2>
          <div className="proposal-analysis-meta">{categoriesLabel}</div>
        </div>
        <button type="button" className="btn-secondary" onClick={onBack}>
          Back
        </button>
      </div>

      {snapshot.adminMessage && (
        <div className="msp-callout msp-callout--info" style={{ marginBottom: 16, textAlign: 'left' }}>
          {snapshot.adminMessage}
        </div>
      )}

      {snapshot.summary && (
        <p style={{ fontSize: 14, color: 'var(--gray-dark)', lineHeight: 1.6, marginBottom: 16 }}>
          {snapshot.summary}
        </p>
      )}

      {snapshot.proposalDocument ? (
        <div className="proposal-analysis-frame-wrap">
          <iframe
            className="proposal-analysis-frame"
            src={proposalUrl}
            title={snapshot.proposalDocument.filename}
          />
        </div>
      ) : (
        <div className="msp-callout msp-callout--info">Proposal document is not available.</div>
      )}

      {allowAccept ? (
        <AcceptQuotePanel
          analysisReviewId={reviewId}
          accountServiceId={accountServiceId}
          serviceLabel={snapshot.vendorName}
          contactName={contactName}
          contactEmail={contactEmail}
          contactPhone={contactPhone}
        />
      ) : null}
    </div>
  );
}
