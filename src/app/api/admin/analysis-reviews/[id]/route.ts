import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { buildDraftFromParse, mapReviewRow } from '@/lib/services/analysis-reviews';
import { loadMerchantAnalysisProviders } from '@/lib/analysis/merchant-analysis-providers';
import type { PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';
import type { ScheduleARateLine } from '@/lib/schedule-a-types';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { calcProviderSavingsQuotes } from '@/lib/analysis/our-rate-savings';
import { computeUcaasQuoteFromSnapshot } from '@/lib/ucaas/quote-engine';
import { queueAnalysisPublishedEmail } from '@/lib/notifications/analysis-email';
import { preferenceKeyForPublishedAnalysis } from '@/lib/notifications/analysis-publish-preference';
import { formatCategoriesLabel, normalizeReviewCategories } from '@/lib/provider-categories';
import type { ProviderCategory } from '@/lib/provider-categories';

async function lookupCustomerMcc(email: string | null): Promise<string | null> {
  if (!email?.trim()) return null;
  const admin = createSupabaseAdminClient();
  const { data: contact } = await admin
    .from('customer_contacts')
    .select('customer_id')
    .ilike('email', email.trim())
    .limit(1)
    .maybeSingle();
  if (!contact?.customer_id) return null;
  const { data: customer } = await admin
    .from('customers')
    .select('mcc_code')
    .eq('id', contact.customer_id)
    .maybeSingle();
  return (customer?.mcc_code as string | null) ?? null;
}

type PatchBody = {
  status?: 'in_progress' | 'dismissed';
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

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from('bill_analysis_reviews').select('*').eq('id', id).maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const review = mapReviewRow(data);
  const providers = await loadMerchantAnalysisProviders();
  const categoryProviders = providers.filter(
    (p) => review.detected_category === 'merchant_services',
  );
  const customerMcc = await lookupCustomerMcc(review.customer_email);
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
        mccCode: customerMcc,
      });

  return NextResponse.json({ review, draftSuggestion, providers: categoryProviders, customerMcc });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as PatchBody;
  const admin = createSupabaseAdminClient();

  const { data: existing, error: loadErr } = await admin
    .from('bill_analysis_reviews')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const review = mapReviewRow(existing);
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: now };

  if (body.status) update.status = body.status;
  if (body.adminNotes !== undefined) update.admin_notes = body.adminNotes;

  const normalizedCategories = body.categories?.length
    ? normalizeReviewCategories(body.categories as ProviderCategory[], review.detected_category)
    : null;

  if (normalizedCategories) {
    update.detected_categories = normalizedCategories;
    update.detected_category = normalizedCategories[0];
    update.category_label = formatCategoriesLabel(normalizedCategories);
  }

  let draft = body.draftSnapshot ?? review.draft_snapshot ?? review.published_snapshot;
  const trimmedVendorName = body.vendorName?.trim();

  if (trimmedVendorName) {
    update.vendor_name = trimmedVendorName;
    if (review.account_service_id) {
      const { error: svcErr } = await admin
        .from('account_services')
        .update({ name: trimmedVendorName, updated_at: now })
        .eq('id', review.account_service_id);
      if (svcErr) {
        return NextResponse.json({ error: `Failed to update service name: ${svcErr.message}` }, { status: 500 });
      }
    }
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
    update.draft_snapshot = draft;
    if (body.matchedProviderSlug) update.matched_provider_slug = body.matchedProviderSlug;
  } else if (trimmedVendorName && review.draft_snapshot) {
    update.draft_snapshot = { ...review.draft_snapshot, vendorName: trimmedVendorName };
  } else if (trimmedVendorName) {
    update.draft_snapshot = {
      category: review.detected_category,
      categoryLabel: review.category_label ?? review.detected_category,
      vendorName: trimmedVendorName,
      publishedAt: now,
    };
  }

  const resolvedVendorName = trimmedVendorName || review.vendor_name;

  if (body.publish && draft) {
    const categories = normalizeReviewCategories(
      draft.categories ?? normalizedCategories ?? review.detected_categories,
      review.detected_category,
    );
    const usesMerchantTools =
      categories.some((c) => c === 'merchant_services') && Boolean(draft.merchantAnalysis);
    const needsProposal = categories.some((c) => c !== 'merchant_services');
    const hasUcaasQuote = Boolean(draft.ucaasQuote);
    if (needsProposal && !usesMerchantTools && !draft.proposalDocument?.storagePath && !hasUcaasQuote) {
      return NextResponse.json(
        { error: 'Build a UCaaS quote or upload a customer proposal document before publishing this category.' },
        { status: 400 },
      );
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
    update.published_snapshot = published;
    update.draft_snapshot = published;
    update.status = 'published';
    update.submitted_at = now;

    const serviceUpdate: Record<string, unknown> = {
      vendor: `Analysis complete — ${published.categoriesLabel ?? published.categoryLabel}`,
      updated_at: now,
    };

    let savingsOpportunityOnly = false;
    if (review.account_service_id) {
      const { data: svcRow } = await admin
        .from('account_services')
        .select('candid_managed, savings_opportunity_only')
        .eq('id', review.account_service_id)
        .maybeSingle();
      serviceUpdate.status = svcRow?.candid_managed === false ? 'external' : 'active';
      savingsOpportunityOnly = svcRow?.savings_opportunity_only === true;
    } else {
      serviceUpdate.status = 'active';
    }

    if (published.merchantAnalysis) {
      const publishedForm = {
        ...published.merchantAnalysis.form,
        contactEmail:
          published.merchantAnalysis.form.contactEmail ||
          review.customer_email ||
          '',
        contactName:
          published.merchantAnalysis.form.contactName ||
          review.customer_name ||
          '',
      };
      serviceUpdate.merchant_analysis = {
        ...published.merchantAnalysis,
        form: publishedForm,
        generated: true,
        providerQuotes: published.providerQuotes,
        pricingStructureOptions: published.pricingStructureOptions,
        matchedProviderName: published.matchedProviderName,
        showSupplierName: published.showSupplierName ?? false,
        adminMessage: published.adminMessage,
      };
      serviceUpdate.service_type = 'merchant';
      if (published.merchantAnalysis.statements[0]?.totalFees != null) {
        serviceUpdate.monthly_amount_cents = Math.round(
          published.merchantAnalysis.statements[0].totalFees * 100,
        );
      }
    }
    if (published.proposalDocument) {
      serviceUpdate.analysis_snapshot = published;
      if (!published.merchantAnalysis) {
        serviceUpdate.service_type = categories[0] ?? review.detected_category;
      }
    }
    if (published.ucaasQuote) {
      serviceUpdate.analysis_snapshot = published;
      if (!published.merchantAnalysis) {
        serviceUpdate.service_type = categories.includes('ucaas') ? 'ucaas' : categories[0];
      }
      const ucaasTotals = computeUcaasQuoteFromSnapshot(published.ucaasQuote);
      serviceUpdate.monthly_amount_cents = Math.round(ucaasTotals.monthlyTotal * 100);
    }

    if (normalizedCategories) {
      update.detected_categories = categories;
      update.detected_category = categories[0];
      update.category_label = formatCategoriesLabel(categories);
    }

    if (review.account_service_id) {
      await admin.from('account_services').update(serviceUpdate).eq('id', review.account_service_id);
    }

    const publishPreferenceKey = preferenceKeyForPublishedAnalysis({
      review,
      savingsOpportunityOnly,
    });

    await admin.from('member_notifications').insert({
      user_id: review.user_id,
      type: 'analysis_published',
      title: 'Your savings analysis is ready',
      body: `We've finished reviewing your ${resolvedVendorName} bill. Open My Services to see your personalized savings analysis.`,
      account_service_id: review.account_service_id,
      analysis_review_id: review.id,
    });

    update.customer_notified_at = now;

    await queueAnalysisPublishedEmail({
      email: review.customer_email ?? '',
      userId: review.user_id,
      customerName: review.customer_name ?? 'there',
      vendorName: resolvedVendorName,
      preferenceKey: publishPreferenceKey,
    });
  }

  const { data, error } = await admin
    .from('bill_analysis_reviews')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ review: mapReviewRow(data) });
}
