import type { BillParseResult, BillAnalysisReviewRow, PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';
import { parseBillFromFile } from '@/lib/bill-parse';
import { buildDraftFromParse, mapReviewRow } from '@/lib/services/analysis-reviews';
import { looksLikeGarbageVendorName } from '@/lib/bill-vendor-resolve';
import { isLocalPersistence } from '@/lib/persistence/config';
import { listLocalAnalysisReviews } from '@/lib/persistence/local-data-store';
import {
  createLocalAnalysisReview,
  patchLocalAnalysisReview,
  submitLocalBillAnalysisConfirmation,
  type LocalAnalysisReviewPatch,
} from '@/lib/persistence/local-analysis-review';
import { fetchMerchantAnalysisProviders } from '@/lib/analysis/fetch-merchant-analysis-providers';
import type { MerchantAnalysisProvider } from '@/lib/analysis/types';
import { normalizeReviewCategories } from '@/lib/provider-categories';
import type { BillAnalysisConfirmPayload } from '@/lib/bill-analysis-confirm';

export async function createAnalysisReview(params: {
  userId: string;
  accountServiceId: string;
  vendorName: string;
  filename: string;
  billStoragePath: string;
  parseResult: BillParseResult;
  customerEmail?: string;
  customerName?: string;
  crmCustomerId?: string;
}): Promise<BillAnalysisReviewRow> {
  if (isLocalPersistence()) {
    const review = createLocalAnalysisReview({
      userId: params.userId,
      accountServiceId: params.accountServiceId,
      vendorName: params.vendorName,
      filename: params.filename,
      billStoragePath: params.billStoragePath,
      parseResult: params.parseResult,
      customerEmail: params.customerEmail,
      customerName: params.customerName,
      crmCustomerId: params.crmCustomerId,
    });
    return review;
  }

  const res = await fetch('/api/portal/analysis-reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'Failed to queue analysis review');
  }
  const data = (await res.json()) as { review?: BillAnalysisReviewRow };
  if (!data.review) throw new Error('Review not created');
  return data.review;
}

export async function parseAndQueueBillReview(params: {
  userId: string;
  file: File;
  accountServiceId: string;
  vendorName: string;
  billStoragePath: string;
  customerEmail?: string;
  customerName?: string;
  crmCustomerId?: string;
}): Promise<{ parseResult: BillParseResult; review: BillAnalysisReviewRow }> {
  const parseResult = await parseBillFromFile(params.file, params.vendorName);
  const userVendor = params.vendorName?.trim();
  const vendorName =
    userVendor && !looksLikeGarbageVendorName(userVendor)
      ? userVendor
      : parseResult.vendorName || userVendor || 'Unknown vendor';

  const review = await createAnalysisReview({
    userId: params.userId,
    accountServiceId: params.accountServiceId,
    vendorName,
    filename: params.file.name,
    billStoragePath: params.billStoragePath,
    parseResult: { ...parseResult, vendorName },
    customerEmail: params.customerEmail,
    customerName: params.customerName,
    crmCustomerId: params.crmCustomerId,
  });
  return { parseResult: { ...parseResult, vendorName }, review };
}

export async function fetchAdminAnalysisReviews(status?: string): Promise<BillAnalysisReviewRow[]> {
  if (isLocalPersistence()) {
    return listLocalAnalysisReviews({ status });
  }

  const params = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await fetch(`/api/admin/analysis-reviews${params}`);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'Failed to load reviews');
  }
  const data = (await res.json()) as { reviews?: BillAnalysisReviewRow[] };
  return data.reviews ?? [];
}

export async function fetchAdminAnalysisReviewDetail(reviewId: string): Promise<{
  review: BillAnalysisReviewRow;
  draftSuggestion: PublishedAnalysisSnapshot;
  providers: MerchantAnalysisProvider[];
  customerMcc: string | null;
}> {
  if (isLocalPersistence()) {
    const review = listLocalAnalysisReviews().find((r) => r.id === reviewId);
    if (!review) throw new Error('Review not found');
    const providers = await fetchMerchantAnalysisProviders();
    const categoryProviders = providers.filter(
      (p) => review.detected_category === 'merchant_services',
    );
    const draftSuggestion = review.draft_snapshot
      ? {
          ...review.draft_snapshot,
          vendorName: review.vendor_name,
          categories: normalizeReviewCategories(
            review.draft_snapshot.categories ?? review.detected_categories,
            review.detected_category,
          ),
        }
      : buildDraftFromParse(review.parse_result, review.vendor_name, categoryProviders, {
          mccCode: null,
        });
    return { review, draftSuggestion, providers: categoryProviders, customerMcc: null };
  }

  const res = await fetch(`/api/admin/analysis-reviews/${reviewId}`, { cache: 'no-store' });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'Failed to load review');
  }
  return (await res.json()) as {
    review: BillAnalysisReviewRow;
    draftSuggestion: PublishedAnalysisSnapshot;
    providers: MerchantAnalysisProvider[];
    customerMcc: string | null;
  };
}

export async function patchAnalysisReview(
  reviewId: string,
  body: LocalAnalysisReviewPatch,
): Promise<BillAnalysisReviewRow> {
  if (isLocalPersistence()) {
    return patchLocalAnalysisReview(reviewId, body);
  }

  const res = await fetch(`/api/admin/analysis-reviews/${reviewId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'Save failed');
  }
  const data = (await res.json()) as { review?: BillAnalysisReviewRow };
  if (!data.review) throw new Error('Save failed');
  return data.review;
}

export { mapReviewRow };

export async function submitBillAnalysisConfirmation(
  reviewId: string,
  payload: BillAnalysisConfirmPayload,
  userId?: string,
): Promise<BillAnalysisReviewRow> {
  if (isLocalPersistence()) {
    if (!userId) throw new Error('Not signed in');
    return submitLocalBillAnalysisConfirmation(reviewId, userId, payload);
  }

  const res = await fetch(`/api/portal/analysis-reviews/${encodeURIComponent(reviewId)}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'Failed to submit confirmation');
  }
  const data = (await res.json()) as { review?: BillAnalysisReviewRow };
  if (!data.review) throw new Error('Confirm failed');
  return data.review;
}
