import type { ProviderSavingsQuote } from '@/lib/analysis/types';

/** Generic label when the processor/supplier name must stay hidden from the customer. */
export const HIDDEN_SUPPLIER_LABEL = 'Candid-negotiated rate';
export const HIDDEN_SUPPLIER_OPTION_LABEL = 'Proposed pricing';

/** True only when admin explicitly opted in to showing the supplier on the savings estimate. */
export function shouldShowSupplierName(flag?: boolean | null): boolean {
  return flag === true;
}

/** Customer-facing partner/processor name (undefined when hidden). */
export function displayPartnerName(
  name: string | undefined | null,
  showSupplierName?: boolean | null,
): string | undefined {
  if (!name?.trim()) return undefined;
  return shouldShowSupplierName(showSupplierName) ? name.trim() : undefined;
}

/** Customer-facing label for a provider quote row or accordion title. */
export function displayProviderQuoteLabel(
  providerName: string,
  showSupplierName?: boolean | null,
  index = 0,
  total = 1,
): string {
  if (shouldShowSupplierName(showSupplierName)) return providerName;
  if (total > 1) return `Proposed option ${String.fromCharCode(65 + index)}`;
  return HIDDEN_SUPPLIER_OPTION_LABEL;
}

/** Strip processor names from provider quotes for customer-facing savings estimates. */
export function customerProviderQuotes(
  quotes: ProviderSavingsQuote[],
  showSupplierName?: boolean | null,
): ProviderSavingsQuote[] {
  if (shouldShowSupplierName(showSupplierName)) return quotes;
  return quotes.map((q, i) => ({
    ...q,
    providerName: displayProviderQuoteLabel(q.providerName, false, i, quotes.length),
  }));
}
