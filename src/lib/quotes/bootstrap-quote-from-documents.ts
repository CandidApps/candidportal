import { parseBillFromFile } from '@/lib/bill-parse';
import type { BillParseResult } from '@/lib/bill-parse-types';
import {
  PROVIDER_CATEGORY_OPTIONS,
  type ProviderCategory,
} from '@/lib/provider-categories';
import { quoteMerchantSnapshotFromParse } from '@/lib/quotes/merchant-quote-statement';
import type { PublishedQuoteSnapshot } from '@/lib/quotes/types';
import { serviceTypeLabel } from '@/lib/services/quote-requests';

const CATEGORY_TO_QUOTE_SERVICE: Partial<Record<ProviderCategory | 'other', string>> = {
  merchant_services: 'merchant',
  payments_ach: 'merchant',
  internet: 'internet',
  ucaas: 'ucaas',
  ccaas: 'ucaas',
  cloud_saas: 'cloud',
  security: 'security',
  other: 'other',
};

const CATEGORY_SORT = PROVIDER_CATEGORY_OPTIONS.map((o) => o.value);

export function sortProviderCategories(categories: ProviderCategory[]): ProviderCategory[] {
  const order = new Map(CATEGORY_SORT.map((c, i) => [c, i]));
  return [...new Set(categories)].sort(
    (a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99),
  );
}

export function quoteServiceTypeFromCategory(category: ProviderCategory | 'other'): string {
  return CATEGORY_TO_QUOTE_SERVICE[category] ?? 'other';
}

export async function parseBillsForQuoteBootstrap(files: File[]): Promise<{
  parses: { file: File; result: BillParseResult }[];
  categories: ProviderCategory[];
  primaryServiceTypeId: string;
  draftSnapshot: PublishedQuoteSnapshot;
}> {
  const parses: { file: File; result: BillParseResult }[] = [];
  for (const file of files) {
    try {
      const result = await parseBillFromFile(file);
      parses.push({ file, result });
    } catch {
      // Skip unreadable files; account docs still save separately.
    }
  }

  const categories = sortProviderCategories(
    parses.map((p) => p.result.category as ProviderCategory).filter(Boolean),
  );
  const ordered = categories.length ? categories : (['other'] as ProviderCategory[]);
  const primaryServiceTypeId = quoteServiceTypeFromCategory(ordered[0]!);

  const merchantParse = parses.find((p) => p.result.category === 'merchant_services');
  const merchantQuote = merchantParse
    ? quoteMerchantSnapshotFromParse(merchantParse.result, merchantParse.file.name)
    : null;

  const draftSnapshot: PublishedQuoteSnapshot = {
    serviceTypeId: primaryServiceTypeId,
    serviceLabel: serviceTypeLabel(primaryServiceTypeId),
    categories: ordered,
    quotePath:
      primaryServiceTypeId === 'merchant'
        ? 'instant_merchant'
        : primaryServiceTypeId === 'ucaas'
          ? 'instant_ucaas'
          : 'manual',
    merchantQuote: merchantQuote ?? undefined,
  };

  return { parses, categories: ordered, primaryServiceTypeId, draftSnapshot };
}
