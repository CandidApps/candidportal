export type ProviderCategory =
  | 'merchant_services'
  | 'internet'
  | 'ucaas'
  | 'ccaas'
  | 'mobility'
  | 'security'
  | 'cloud_saas'
  | 'payments_ach'
  | 'hardware'
  | 'managed_it'
  | 'other';

export const PROVIDER_CATEGORY_OPTIONS: { value: ProviderCategory; label: string }[] = [
  { value: 'merchant_services', label: 'Merchant Services' },
  { value: 'internet', label: 'Internet' },
  { value: 'ucaas', label: 'UCaaS' },
  { value: 'ccaas', label: 'CCaaS' },
  { value: 'mobility', label: 'Mobility / Wireless' },
  { value: 'security', label: 'Security' },
  { value: 'cloud_saas', label: 'Cloud / SaaS' },
  { value: 'payments_ach', label: 'Payments / ACH' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'managed_it', label: 'Managed IT' },
  { value: 'other', label: 'Other' },
];

export function providerCategoryLabel(category?: ProviderCategory | string | null): string {
  if (!category) return '—';
  return PROVIDER_CATEGORY_OPTIONS.find((o) => o.value === category)?.label ?? category;
}

export function isMerchantServicesCategory(category?: ProviderCategory | string | null): boolean {
  return category === 'merchant_services';
}

/** Categories with parsed fee schedules / rate tooling (merchant processing). */
export function categorySupportsFeeAnalysis(category?: ProviderCategory | string | null): boolean {
  return isMerchantServicesCategory(category);
}

export function isUcaasCategory(category?: ProviderCategory | string | null): boolean {
  return category === 'ucaas';
}

/** Categories with a structured in-app quote builder (UCaaS configurator). */
export function categorySupportsUcaasQuote(category?: ProviderCategory | string | null): boolean {
  return isUcaasCategory(category);
}

export function reviewUsesUcaasQuote(categories: (ProviderCategory | string)[]): boolean {
  return categories.some((c) => categorySupportsUcaasQuote(c));
}

/** Supplier detail "UCaaS catalog" tab visibility. */
export function showUcaasCatalogTab(provider: {
  providerCategory?: ProviderCategory | string | null;
}): boolean {
  return isUcaasCategory(provider.providerCategory);
}

export function formatCategoriesLabel(categories?: (ProviderCategory | string)[] | null): string {
  if (!categories?.length) return '—';
  return categories.map((c) => providerCategoryLabel(c)).join(' · ');
}

export function normalizeReviewCategories(
  categories?: (ProviderCategory | string)[] | null,
  fallback?: ProviderCategory | string | null,
): ProviderCategory[] {
  const raw = categories?.length ? categories : fallback ? [fallback] : ['other'];
  const seen = new Set<string>();
  const out: ProviderCategory[] = [];
  for (const c of raw) {
    const value = String(c || 'other') as ProviderCategory;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out.length ? out : ['other'];
}

export function reviewUsesMerchantFeeTools(
  categories: (ProviderCategory | string)[],
  hasMerchantStatement?: boolean,
): boolean {
  return categories.some((c) => categorySupportsFeeAnalysis(c)) && Boolean(hasMerchantStatement);
}

export function reviewNeedsProposalDocument(categories: (ProviderCategory | string)[]): boolean {
  return categories.some((c) => !categorySupportsFeeAnalysis(c));
}

export function showOurRateTab(provider: {
  includeRatesInAnalysis?: boolean;
  providerCategory?: ProviderCategory | string | null;
}): boolean {
  return Boolean(provider.includeRatesInAnalysis && isMerchantServicesCategory(provider.providerCategory));
}
