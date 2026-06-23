import type { PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';
import type { BillAnalysisReviewRow } from '@/lib/bill-parse-types';
import { calcProviderSavingsQuotes } from '@/lib/analysis/our-rate-savings';
import { formatCategoriesLabel, normalizeReviewCategories } from '@/lib/provider-categories';
import type { ProviderCategory } from '@/lib/provider-categories';
import type { ScheduleARateLine } from '@/lib/schedule-a-types';
import {
  getLocalAnalysisReview,
  insertLocalAnalysisReview,
  newLocalId,
  updateLocalAccountService,
  updateLocalAnalysisReview,
} from '@/lib/persistence/local-data-store';

export type LocalAnalysisReviewPatch = {
  status?: 'in_progress' | 'dismissed' | 'published' | 'pending_review';
  adminNotes?: string;
  vendorName?: string;
  categories?: string[];
  draftSnapshot?: PublishedAnalysisSnapshot;
  ourRateLines?: ScheduleARateLine[];
  matchedProviderSlug?: string;
  matchedProviderName?: string;
  adminMessage?: string;
  publish?: boolean;
};

export function patchLocalAnalysisReview(
  id: string,
  body: LocalAnalysisReviewPatch,
): BillAnalysisReviewRow {
  const existing = getLocalAnalysisReview(id);
  if (!existing) {
    throw new Error('Review not found');
  }

  const now = new Date().toISOString();
  const review = existing;
  const trimmedVendorName = body.vendorName?.trim();

  const normalizedCategories = body.categories?.length
    ? normalizeReviewCategories(body.categories as ProviderCategory[], review.detected_category)
    : null;

  let draft = body.draftSnapshot ?? review.draft_snapshot ?? review.published_snapshot;

  const patch: Partial<BillAnalysisReviewRow> = {
    updated_at: now,
  };

  if (body.status && !body.publish) patch.status = body.status;
  if (body.adminNotes !== undefined) patch.admin_notes = body.adminNotes;
  if (trimmedVendorName) patch.vendor_name = trimmedVendorName;

  if (normalizedCategories) {
    patch.detected_categories = normalizedCategories;
    patch.detected_category = normalizedCategories[0];
    patch.category_label = formatCategoriesLabel(normalizedCategories);
  }

  if (draft) {
    if (body.draftSnapshot) {
      draft = {
        ...(review.draft_snapshot ?? {}),
        ...body.draftSnapshot,
        proposalDocument:
          body.draftSnapshot.proposalDocument ?? review.draft_snapshot?.proposalDocument,
      };
    }
    if (body.ourRateLines) draft = { ...draft, ourRateLines: body.ourRateLines };
    if (body.matchedProviderSlug) draft = { ...draft, matchedProviderSlug: body.matchedProviderSlug };
    if (body.matchedProviderName) draft = { ...draft, matchedProviderName: body.matchedProviderName };
    if (body.adminMessage !== undefined) draft = { ...draft, adminMessage: body.adminMessage };
    if (trimmedVendorName) draft = { ...draft, vendorName: trimmedVendorName };
    if (normalizedCategories) {
      draft = {
        ...draft,
        categories: normalizedCategories,
        category: normalizedCategories[0],
        categoryLabel: formatCategoriesLabel(normalizedCategories),
        categoriesLabel: formatCategoriesLabel(normalizedCategories),
      };
    }
    patch.draft_snapshot = draft;
    if (body.matchedProviderSlug) patch.matched_provider_slug = body.matchedProviderSlug;
  }

  if (trimmedVendorName && review.account_service_id) {
    updateLocalAccountService(review.account_service_id, { name: trimmedVendorName });
  }

  if (body.publish && draft) {
    const categories = normalizeReviewCategories(
      draft.categories ?? normalizedCategories ?? review.detected_categories,
      review.detected_category,
    );
    const usesMerchantTools =
      categories.some((c) => c === 'merchant_services') && Boolean(draft.merchantAnalysis);
    const needsProposal = categories.some((c) => c !== 'merchant_services');
    if (needsProposal && !usesMerchantTools && !draft.proposalDocument?.storagePath) {
      throw new Error('Upload a customer proposal document before publishing this category.');
    }

    let published: PublishedAnalysisSnapshot = {
      ...draft,
      categories,
      category: categories[0],
      categoryLabel: formatCategoriesLabel(categories),
      categoriesLabel: formatCategoriesLabel(categories),
      adminMessage: body.adminMessage ?? draft.adminMessage,
      publishedAt: now,
    };

    if (published.merchantAnalysis && body.ourRateLines?.length) {
      published = {
        ...published,
        ourRateLines: body.ourRateLines,
        providerQuotes: calcProviderSavingsQuotes(
          [
            {
              id: body.matchedProviderSlug || 'published',
              name: body.matchedProviderName || published.vendorName,
              lines: body.ourRateLines,
            },
          ],
          published.merchantAnalysis.form,
          published.merchantAnalysis.statements,
        ),
      };
    }

    patch.published_snapshot = published;
    patch.draft_snapshot = published;
    patch.status = 'published';
    patch.submitted_at = now;
    patch.customer_notified_at = now;

    if (review.account_service_id) {
      const serviceUpdate: Record<string, unknown> = {
        vendor: `Analysis complete — ${published.categoriesLabel ?? published.categoryLabel}`,
        status: 'external',
        analysis_snapshot: published,
      };

      if (published.merchantAnalysis) {
        const publishedForm = {
          ...published.merchantAnalysis.form,
          contactEmail:
            published.merchantAnalysis.form.contactEmail || review.customer_email || '',
          contactName:
            published.merchantAnalysis.form.contactName || review.customer_name || '',
        };
        serviceUpdate.merchant_analysis = {
          ...published.merchantAnalysis,
          form: publishedForm,
          generated: true,
          providerQuotes: published.providerQuotes,
          pricingStructureOptions: published.pricingStructureOptions,
          matchedProviderName: published.matchedProviderName,
          adminMessage: published.adminMessage,
        };
        serviceUpdate.service_type = 'merchant';
        if (published.merchantAnalysis.statements[0]?.totalFees != null) {
          serviceUpdate.monthly_amount_cents = Math.round(
            published.merchantAnalysis.statements[0].totalFees * 100,
          );
        }
      } else if (published.proposalDocument) {
        serviceUpdate.service_type = categories[0] ?? review.detected_category;
      }

      updateLocalAccountService(review.account_service_id, serviceUpdate as never);
    }
  }

  const updated = updateLocalAnalysisReview(id, patch);
  if (!updated) throw new Error('Update failed');
  return updated;
}

export function createLocalAnalysisReview(params: {
  userId: string;
  accountServiceId: string;
  vendorName: string;
  filename: string;
  billStoragePath: string;
  parseResult: BillAnalysisReviewRow['parse_result'];
  customerEmail?: string;
  customerName?: string;
}): BillAnalysisReviewRow {
  const now = new Date().toISOString();
  const category = String(params.parseResult.category ?? 'other');
  const categoryLabel = String(params.parseResult.categoryLabel ?? category);
  const review: BillAnalysisReviewRow = {
    id: newLocalId(),
    user_id: params.userId,
    account_service_id: params.accountServiceId,
    customer_email: params.customerEmail ?? null,
    customer_name: params.customerName ?? null,
    vendor_name: params.vendorName,
    filename: params.filename,
    bill_storage_path: params.billStoragePath,
    detected_category: category,
    category_label: categoryLabel,
    detected_categories: [category],
    parse_result: params.parseResult,
    draft_snapshot: null,
    published_snapshot: null,
    matched_provider_slug: null,
    status: 'pending_review',
    admin_notes: null,
    submitted_at: null,
    submitted_by: null,
    customer_notified_at: null,
    created_at: now,
    updated_at: now,
  };

  insertLocalAnalysisReview(review);
  updateLocalAccountService(params.accountServiceId, {
    analysis_review_id: review.id,
    name: params.vendorName,
  });

  return review;
}
