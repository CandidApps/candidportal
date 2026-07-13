import type {
  BillAnalysisReviewRow,
  BillParseResult,
  PublishedAnalysisSnapshot,
} from '@/lib/bill-parse-types';
import type { ProviderSavingsQuote, MerchantProviderSelection, CurrentFeeLine, PricingStructureOption } from '@/lib/analysis/types';
import { buildCurrentFeeLines } from '@/lib/analysis/current-fee-breakdown';
import { selectBestMerchantProvider } from '@/lib/analysis/merchant-provider-selection';
import { buildPricingStructureOptions, defaultSelectedPricingStructures, DEFAULT_DUAL_CUSTOMER_FEE_PCT } from '@/lib/analysis/pricing-structure-options';
import { riskTierFromMcc } from '@/lib/analysis/merchant-risk';
import { buildMerchantAnalysisSnapshot } from '@/lib/candid-pay/merchant-analysis';
import type { MerchantAnalysisProvider } from '@/lib/analysis/types';
import { providerCategoryLabel, formatCategoriesLabel, normalizeReviewCategories } from '@/lib/provider-categories';

export function mapReviewRow(row: Record<string, unknown>): BillAnalysisReviewRow {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    account_service_id: row.account_service_id ? String(row.account_service_id) : null,
    crm_customer_id: (row.crm_customer_id as string | null) ?? null,
    customer_email: (row.customer_email as string | null) ?? null,
    customer_name: (row.customer_name as string | null) ?? null,
    vendor_name: String(row.vendor_name),
    filename: (row.filename as string | null) ?? null,
    bill_storage_path: (row.bill_storage_path as string | null) ?? null,
    detected_category: String(row.detected_category),
    category_label: (row.category_label as string | null) ?? null,
    detected_categories: Array.isArray(row.detected_categories)
      ? (row.detected_categories as string[])
      : null,
    parse_result: (row.parse_result as BillParseResult) ?? {
      category: 'other',
      categoryLabel: 'Other',
      confidence: 'low',
    },
    draft_snapshot: (row.draft_snapshot as PublishedAnalysisSnapshot | null) ?? null,
    published_snapshot: (row.published_snapshot as PublishedAnalysisSnapshot | null) ?? null,
    matched_provider_slug: (row.matched_provider_slug as string | null) ?? null,
    status: row.status as BillAnalysisReviewRow['status'],
    admin_notes: (row.admin_notes as string | null) ?? null,
    submitted_at: (row.submitted_at as string | null) ?? null,
    submitted_by: (row.submitted_by as string | null) ?? null,
    customer_notified_at: (row.customer_notified_at as string | null) ?? null,
    customer_accepted_at: (row.customer_accepted_at as string | null) ?? null,
    customer_acceptance:
      (row.customer_acceptance as BillAnalysisReviewRow['customer_acceptance']) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function buildDraftFromParse(
  parseResult: BillParseResult,
  vendorName: string,
  providers: MerchantAnalysisProvider[],
  options?: { mccCode?: string | null; dualPricingCustomerFeePct?: number },
): PublishedAnalysisSnapshot {
  const merchantAnalysis =
    parseResult.merchantStatement && parseResult.category === 'merchant_services'
      ? buildMerchantAnalysisSnapshot([parseResult.merchantStatement], false)
      : undefined;

  let providerQuotes: ProviderSavingsQuote[] | undefined;
  let matchedProviderSlug: string | undefined;
  let matchedProviderName: string | undefined;
  let ourRateLines = providers[0]?.lines;
  let providerSelection: MerchantProviderSelection | undefined;
  let currentFeeLines: CurrentFeeLine[] | undefined;
  let pricingStructureOptions: PricingStructureOption[] | undefined;
  let selectedPricingStructures: string[] | undefined;

  if (merchantAnalysis && providers.length) {
    const picked = selectBestMerchantProvider(
      providers,
      parseResult,
      vendorName,
      options?.mccCode,
    );
    providerQuotes = picked.providerQuotes;
    providerSelection = picked.selection ?? undefined;
    ourRateLines = picked.ourRateLines;

    if (providerSelection) {
      matchedProviderSlug = providerSelection.providerId;
      matchedProviderName = providerSelection.providerName;
    } else {
      const fallback = providers.find((p) => p.id === 'linked2pay') ?? providers[0];
      if (fallback) {
        matchedProviderSlug = fallback.id;
        matchedProviderName = fallback.displayName ?? fallback.name;
        ourRateLines = fallback.lines;
      }
    }

    if (parseResult.merchantStatement) {
      currentFeeLines = buildCurrentFeeLines([parseResult.merchantStatement], ourRateLines ?? []);
    }

    const risk = riskTierFromMcc(options?.mccCode ?? merchantAnalysis.form.mcc);
    const dualFee = options?.dualPricingCustomerFeePct ?? DEFAULT_DUAL_CUSTOMER_FEE_PCT;
    pricingStructureOptions = buildPricingStructureOptions(
      merchantAnalysis.form,
      ourRateLines ?? [],
      risk.tier,
      undefined,
      dualFee,
      merchantAnalysis.statements,
    );
    selectedPricingStructures = defaultSelectedPricingStructures(pricingStructureOptions);
  }

  const dualPricingCustomerFeePct =
    options?.dualPricingCustomerFeePct ?? DEFAULT_DUAL_CUSTOMER_FEE_PCT;

  const categories = normalizeReviewCategories(
    [parseResult.category],
    parseResult.category,
  );

  return {
    category: categories[0],
    categoryLabel: parseResult.categoryLabel || providerCategoryLabel(categories[0]),
    categories,
    categoriesLabel: formatCategoriesLabel(categories),
    vendorName: vendorName || parseResult.vendorName || 'Unknown vendor',
    summary: parseResult.summary,
    merchantAnalysis,
    providerQuotes,
    ourRateLines,
    matchedProviderSlug,
    matchedProviderName,
    providerSelection,
    currentFeeLines,
    pricingStructureOptions,
    selectedPricingStructures,
    dualPricingCustomerFeePct,
    showSupplierName: false,
    publishedAt: new Date().toISOString(),
  };
}

export function formatReviewTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
