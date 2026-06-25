import type { BillAnalysisReviewRow } from '@/lib/bill-parse-types';
import type { MemberEmailNotificationKey } from '@/lib/portal/notification-preferences';

export function preferenceKeyForPublishedAnalysis(input: {
  review: BillAnalysisReviewRow;
  savingsOpportunityOnly?: boolean;
}): MemberEmailNotificationKey {
  if (input.savingsOpportunityOnly) {
    return 'savings_opportunities';
  }

  const hasStatementUpload = Boolean(
    input.review.bill_storage_path ||
      input.review.parse_result?.merchantStatement ||
      input.review.filename?.toLowerCase().match(/statement|invoice|bill/),
  );

  if (hasStatementUpload) {
    return 'statement_reviewed';
  }

  return 'analysis_complete';
}
