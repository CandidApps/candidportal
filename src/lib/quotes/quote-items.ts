import type { PricingStructureOption } from '@/lib/analysis/types';
import type { ProviderCategory } from '@/lib/provider-categories';
import type { ScheduleARateLine } from '@/lib/schedule-a-types';
import type { UcaasQuoteSnapshot } from '@/lib/ucaas/types';
import type { PublishedQuoteSnapshot, QuoteProposalDocument, QuoteRequestItem, QuoteItemKind } from '@/lib/quotes/types';

export function newQuoteItemId(): string {
  return `qi-${crypto.randomUUID()}`;
}

export function createQuoteItem(kind: QuoteItemKind, partial?: Partial<QuoteRequestItem>): QuoteRequestItem {
  const base: QuoteRequestItem = {
    id: newQuoteItemId(),
    kind,
    createdAt: new Date().toISOString(),
    label: defaultQuoteItemLabel(kind, partial),
  };
  return { ...base, ...partial, id: partial?.id ?? base.id, kind };
}

function defaultQuoteItemLabel(kind: QuoteItemKind, partial?: Partial<QuoteRequestItem>): string {
  if (partial?.label?.trim()) return partial.label.trim();
  if (kind === 'manual') return partial?.matchedProviderName ? `Manual — ${partial.matchedProviderName}` : 'Manual quote';
  if (kind === 'upload') return 'Uploaded quote';
  if (kind === 'supplier_request') {
    return partial?.providerName ? `Supplier — ${partial.providerName}` : 'Supplier request';
  }
  return 'Quote';
}

export function quoteItemsFromSnapshot(snapshot: PublishedQuoteSnapshot | null | undefined): QuoteRequestItem[] {
  if (!snapshot) return [];
  if (snapshot.quoteItems?.length) return snapshot.quoteItems;

  // Legacy single-quote snapshots → one synthetic item
  if (snapshot.ucaasQuote?.lines?.length) {
    return [
      createQuoteItem('manual', {
        serviceTypeId: snapshot.serviceTypeId,
        categories: snapshot.categories,
        ucaasQuote: snapshot.ucaasQuote,
        matchedProviderSlug: snapshot.matchedProviderSlug,
        matchedProviderName: snapshot.matchedProviderName,
        ourRateLines: snapshot.ourRateLines,
        pricingStructureOptions: snapshot.pricingStructureOptions,
        selectedPricingStructures: snapshot.selectedPricingStructures,
        dualPricingCustomerFeePct: snapshot.dualPricingCustomerFeePct,
        showSupplierName: snapshot.showSupplierName,
        label: 'UCaaS quote',
      }),
    ];
  }

  if (snapshot.proposalDocument?.url || snapshot.proposalDocument?.storagePath) {
    return [
      createQuoteItem('upload', {
        proposalDocument: snapshot.proposalDocument,
        label: snapshot.proposalDocument.name ?? 'Uploaded quote',
      }),
    ];
  }

  if (snapshot.pricingStructureOptions?.some((o) => o.selected) || snapshot.ourRateLines?.length) {
    return [
      createQuoteItem('manual', {
        serviceTypeId: snapshot.serviceTypeId,
        categories: snapshot.categories,
        matchedProviderSlug: snapshot.matchedProviderSlug,
        matchedProviderName: snapshot.matchedProviderName,
        ourRateLines: snapshot.ourRateLines,
        pricingStructureOptions: snapshot.pricingStructureOptions,
        selectedPricingStructures: snapshot.selectedPricingStructures,
        dualPricingCustomerFeePct: snapshot.dualPricingCustomerFeePct,
        showSupplierName: snapshot.showSupplierName,
      }),
    ];
  }

  return [];
}

export function quoteItemHasDeliverable(item: QuoteRequestItem): boolean {
  if (item.kind === 'upload') {
    return Boolean(item.proposalDocument?.url || item.proposalDocument?.storagePath);
  }
  if (item.kind === 'supplier_request') {
    return Boolean(
      item.responseQuote?.url ||
        item.responseQuote?.storagePath ||
        item.rfqStatus === 'responded',
    );
  }
  if (item.ucaasQuote?.lines?.length) return true;
  if (item.pricingStructureOptions?.some((o) => o.selected)) return true;
  if (item.proposalDocument?.url || item.proposalDocument?.storagePath) return true;
  return false;
}

export function snapshotHasDeliverable(snapshot: PublishedQuoteSnapshot | null | undefined): boolean {
  if (!snapshot) return false;
  const items = quoteItemsFromSnapshot(snapshot);
  if (items.some(quoteItemHasDeliverable)) return true;
  if (snapshot.adminMessage?.trim()) return true;
  if (
    snapshot.internetQuote?.pricingOptions?.some((o) => o.selected && o.lines.length > 0)
  ) {
    return true;
  }
  return false;
}

export function mergeQuoteItemsIntoSnapshot(
  snapshot: PublishedQuoteSnapshot,
  items: QuoteRequestItem[],
): PublishedQuoteSnapshot {
  const primaryManual = items.find((i) => i.kind === 'manual' && quoteItemHasDeliverable(i));
  const primaryUpload = items.find((i) => i.kind === 'upload' && quoteItemHasDeliverable(i));
  const hasUcaas = items.some((i) => i.ucaasQuote?.lines?.length);
  const hasMerchant = items.some((i) => i.pricingStructureOptions?.some((o) => o.selected));
  const hasUpload = items.some((i) => i.kind === 'upload' && quoteItemHasDeliverable(i));
  const hasSupplierResponse = items.some((i) => i.kind === 'supplier_request' && i.responseQuote);

  let quotePath = snapshot.quotePath ?? 'manual';
  if (hasUcaas) quotePath = 'instant_ucaas';
  else if (hasMerchant) quotePath = 'instant_merchant';
  else if (hasUpload || hasSupplierResponse) quotePath = 'proposal';

  return {
    ...snapshot,
    quoteItems: items,
    quotePath,
    serviceTypeId: primaryManual?.serviceTypeId ?? snapshot.serviceTypeId,
    categories: primaryManual?.categories ?? snapshot.categories,
    ucaasQuote: primaryManual?.ucaasQuote ?? items.find((i) => i.ucaasQuote)?.ucaasQuote,
    matchedProviderSlug: primaryManual?.matchedProviderSlug ?? snapshot.matchedProviderSlug,
    matchedProviderName: primaryManual?.matchedProviderName ?? snapshot.matchedProviderName,
    ourRateLines: primaryManual?.ourRateLines ?? snapshot.ourRateLines,
    pricingStructureOptions: primaryManual?.pricingStructureOptions ?? snapshot.pricingStructureOptions,
    selectedPricingStructures:
      primaryManual?.selectedPricingStructures ?? snapshot.selectedPricingStructures,
    dualPricingCustomerFeePct:
      primaryManual?.dualPricingCustomerFeePct ?? snapshot.dualPricingCustomerFeePct,
    showSupplierName: primaryManual?.showSupplierName ?? snapshot.showSupplierName,
    proposalDocument: primaryUpload?.proposalDocument ?? items.find((i) => i.proposalDocument)?.proposalDocument,
    internetQuote:
      items.find((i) => i.internetQuote)?.internetQuote ?? snapshot.internetQuote,
  };
}

export function updateQuoteItem(
  items: QuoteRequestItem[],
  id: string,
  patch: Partial<QuoteRequestItem>,
): QuoteRequestItem[] {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

export function removeQuoteItem(items: QuoteRequestItem[], id: string): QuoteRequestItem[] {
  return items.filter((item) => item.id !== id);
}
