'use client';

import type { BillParseResult } from '@/lib/bill-parse-types';
import { formatCategoriesLabel } from '@/lib/provider-categories';

export function MemberBillPendingReview({
  vendorName,
  parseResult,
  categories,
  onBack,
}: {
  vendorName: string;
  parseResult?: BillParseResult | null;
  categories?: string[] | null;
  onBack?: () => void;
}) {
  const categoryLabel = categories?.length
    ? formatCategoriesLabel(categories)
    : parseResult?.categoryLabel ?? formatCategoriesLabel([parseResult?.category ?? 'other']);

  return (
    <div className="human-review-wrap" style={{ maxWidth: 560, margin: '0 auto', padding: '24px 0' }}>
      <div className="human-review-icon">
        <span style={{ fontSize: 40 }}>🔍</span>
      </div>
      <div className="human-review-title">Your bill is with our team</div>
      <div className="human-review-sub" style={{ marginBottom: 16 }}>
        We received your <strong>{vendorName}</strong> bill and a Candid specialist is reviewing it before we show
        savings numbers. You&apos;ll get a notification in your portal when your analysis is ready
        {parseResult?.category || categories?.length ? (
          <>
            {' '}
            (detected: <strong>{categoryLabel}</strong>)
          </>
        ) : null}
        .
      </div>
      <p style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.6, marginBottom: 20 }}>
        Every analysis is verified for accuracy. This usually takes less than 24 hours, but can take up to 72 hours.
      </p>
      {parseResult?.summary && (
        <div className="msp-callout msp-callout--info" style={{ textAlign: 'left', marginBottom: 20 }}>
          {parseResult.summary}
        </div>
      )}
      {onBack && (
        <button type="button" className="btn-primary" style={{ width: '100%' }} onClick={onBack}>
          Back to My Services
        </button>
      )}
    </div>
  );
}
