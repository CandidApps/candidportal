import { detectServiceTypeFromText } from '@/lib/candid-data';
import { createQuoteItem, quoteItemsFromSnapshot } from '@/lib/quotes/quote-items';
import {
  detectQuoteServiceTypeId,
  quoteServiceToCategories,
} from '@/lib/quotes/quote-request-analysis';
import type { PublishedQuoteSnapshot } from '@/lib/quotes/types';
import type { QuoteRequestRow } from '@/lib/services/quote-requests';
import { serviceTypeLabel } from '@/lib/services/quote-requests';

export type LeadQuoteWorkbenchHint = {
  source?: 'bill_analysis' | 'quote_request' | 'manual';
  helpWith?: string;
  currentTechnology?: string;
  companyFriendly?: string;
};

const PROFILE_TO_QUOTE_SERVICE: Record<string, string> = {
  merchant: 'merchant',
  internet: 'internet',
  ucaas: 'ucaas',
  microsoft: 'cloud',
  security: 'security',
  cloud: 'cloud',
};

/** Guess service type for admin-initiated quotes (often empty on the row until configured). */
export function inferQuoteServiceTypeId(
  row: QuoteRequestRow,
  linkedLead?: LeadQuoteWorkbenchHint | null,
): string {
  const fromRow = detectQuoteServiceTypeId(row);
  if (fromRow) return fromRow;
  if (linkedLead?.source === 'bill_analysis') return 'merchant';
  const text = [
    linkedLead?.helpWith,
    linkedLead?.currentTechnology,
    linkedLead?.companyFriendly,
  ]
    .filter(Boolean)
    .join(' ');
  if (text.trim()) {
    const profile = detectServiceTypeFromText(text);
    const mapped = PROFILE_TO_QUOTE_SERVICE[profile];
    if (mapped) return mapped;
  }
  return 'merchant';
}

/** Ensure admin quote workbench has a manual line item and merchant-friendly defaults when possible. */
export function bootstrapAdminQuoteDraft(
  snap: PublishedQuoteSnapshot | null,
  row: QuoteRequestRow,
  linkedLead?: LeadQuoteWorkbenchHint | null,
): PublishedQuoteSnapshot {
  const serviceTypeId =
    snap?.serviceTypeId ?? row.service_type_id ?? inferQuoteServiceTypeId(row, linkedLead);
  const categories = snap?.categories?.length
    ? snap.categories
    : quoteServiceToCategories(serviceTypeId);

  const base: PublishedQuoteSnapshot = {
    quotePath: 'manual',
    ...snap,
    serviceTypeId,
    serviceLabel: snap?.serviceLabel ?? serviceTypeLabel(serviceTypeId),
    categories,
  };

  const existingItems = quoteItemsFromSnapshot(base);
  if (existingItems.length) {
    return { ...base, quoteItems: base.quoteItems ?? existingItems };
  }

  return {
    ...base,
    quoteItems: [
      createQuoteItem('manual', {
        serviceTypeId,
        categories,
        label: 'Manual quote',
      }),
    ],
  };
}
