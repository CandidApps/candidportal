import { logoKeyFromLabel, type ServiceCardModel } from '@/lib/services/account-services';
import { resolveSupplierLogo } from '@/lib/supplier-logos';
import type { PublishedQuoteSnapshot, QuoteMerchantSnapshot } from '@/lib/quotes/types';
import {
  buildSavingsBaselineFromPublishedQuote,
  proposedMonthlyFromPublishedQuote,
} from '@/lib/quotes/published-quote-savings';
import {
  isQuoteRequestAccepted,
  resolveQuoteServiceLabel,
  type QuoteRequestRow,
} from '@/lib/services/quote-requests';

function merchantQuoteFromSnapshot(
  snap: PublishedQuoteSnapshot | null | undefined,
): QuoteMerchantSnapshot | null {
  if (!snap) return null;
  if (snap.merchantQuote?.statements?.length) return snap.merchantQuote;
  for (const item of snap.quoteItems ?? []) {
    if (item.merchantQuote?.statements?.length) return item.merchantQuote;
  }
  return snap.merchantQuote ?? null;
}

function proposedVendorFromSnapshot(snap: PublishedQuoteSnapshot | null | undefined): string | null {
  if (!snap) return null;
  return (
    snap.matchedProviderName?.trim() ||
    snap.quoteItems?.find((i) => i.matchedProviderName?.trim())?.matchedProviderName?.trim() ||
    snap.quoteItems?.find((i) => i.providerName?.trim())?.providerName?.trim() ||
    snap.quoteItems?.find((i) => i.label?.trim())?.label?.replace(/^Manual\s*[—-]\s*/i, '').trim() ||
    null
  );
}

function formatMonthlyAmount(amount: number | null | undefined): string | undefined {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return undefined;
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function savingsFieldsFromQuote(quote: QuoteRequestRow) {
  const baseline = buildSavingsBaselineFromPublishedQuote(
    quote.published_quote_snapshot,
    quote.customer_acceptance,
    quote.customer_accepted_at || quote.published_at,
  );
  const proposedMonthly =
    quote.customer_acceptance?.monthlyTotal ??
    proposedMonthlyFromPublishedQuote(quote.published_quote_snapshot);
  return { baseline, proposedMonthly };
}

/** Candid-managed pending contract card from an accepted published quote. */
export function pendingContractServiceFromQuote(quote: QuoteRequestRow): ServiceCardModel | null {
  if (!isQuoteRequestAccepted(quote)) return null;

  const snap = quote.published_quote_snapshot;
  const proposedVendor = proposedVendorFromSnapshot(snap);
  const serviceLabel = quote.customer_acceptance?.serviceLabel?.trim() || resolveQuoteServiceLabel(quote);
  const name = proposedVendor || serviceLabel;
  const logoInfo = resolveSupplierLogo(proposedVendor, serviceLabel);
  const logo =
    logoInfo.key !== 'msp' ? logoInfo.key : logoKeyFromLabel(name);
  const { baseline, proposedMonthly } = savingsFieldsFromQuote(quote);

  return {
    id: `quote-pending-${quote.id}`,
    cls: 'candid-svc',
    logo,
    logoTxt: logoInfo.initials || 'SV',
    name,
    vendor: 'Quote accepted — contract in progress',
    status: 'pending',
    statusTxt: 'Pending contract',
    badge: 'candid',
    candidManaged: true,
    pending: true,
    pendingContract: true,
    amount: formatMonthlyAmount(proposedMonthly),
    filter: ['candid'],
    crmCustomerId: quote.crm_customer_id ?? null,
    quoteRequestId: quote.id,
    serviceTypeId: snap?.serviceTypeId ?? quote.service_type_id ?? undefined,
    savingsBaseline: baseline,
  };
}

/** Current supplier (statement upload) shown under Services not with Candid until conversion. */
export function replacementExternalServiceFromQuote(quote: QuoteRequestRow): ServiceCardModel | null {
  if (!isQuoteRequestAccepted(quote)) return null;

  const mq = merchantQuoteFromSnapshot(quote.published_quote_snapshot);
  if (!mq?.vendorName?.trim() || !mq.statements?.length) return null;

  const currentVendor = mq.vendorName.trim();
  const stmt = mq.statements[0];
  const monthly = stmt?.totalFees;
  const logoInfo = resolveSupplierLogo(currentVendor, currentVendor);
  const logo =
    logoInfo.key !== 'msp' ? logoInfo.key : logoKeyFromLabel(currentVendor);
  const proposed = proposedVendorFromSnapshot(quote.published_quote_snapshot);

  return {
    id: `quote-replace-${quote.id}`,
    cls: 'external-svc',
    logo,
    logoTxt: logoInfo.initials || 'EX',
    name: currentVendor,
    vendor: proposed
      ? `Current provider · switching to ${proposed}`
      : 'Current provider · Candid quote accepted',
    status: 'external',
    statusTxt: 'Being replaced',
    badge: 'external',
    candidManaged: false,
    pending: false,
    beingReplaced: true,
    amount: formatMonthlyAmount(monthly),
    filter: ['external'],
    crmCustomerId: quote.crm_customer_id ?? null,
    quoteRequestId: quote.id,
    billFilename: mq.filename,
    serviceTypeId: quote.published_quote_snapshot?.serviceTypeId ?? quote.service_type_id ?? undefined,
  };
}

function enrichPendingWithQuoteSavings(
  svc: ServiceCardModel,
  quote: QuoteRequestRow,
): ServiceCardModel {
  const { baseline, proposedMonthly } = savingsFieldsFromQuote(quote);
  if (!baseline && !proposedMonthly) return svc;
  return {
    ...svc,
    savingsBaseline: svc.savingsBaseline ?? baseline ?? null,
    amount: svc.amount || formatMonthlyAmount(proposedMonthly),
    quoteRequestId: svc.quoteRequestId ?? quote.id,
  };
}

export function mergeQuoteDerivedMemberServices(
  candid: ServiceCardModel[],
  external: ServiceCardModel[],
  acceptedQuotes: QuoteRequestRow[],
): { candid: ServiceCardModel[]; external: ServiceCardModel[] } {
  const nextCandid = [...candid];
  const nextExternal = [...external];

  for (const quote of acceptedQuotes) {
    const pending = pendingContractServiceFromQuote(quote);
    if (pending) {
      const dbIdx = nextCandid.findIndex(
        (s) =>
          s.pendingContract &&
          !s.id.startsWith('quote-pending-') &&
          (s.name === pending.name ||
            s.crmCustomerId === pending.crmCustomerId ||
            s.quoteRequestId === quote.id),
      );
      if (dbIdx >= 0) {
        nextCandid[dbIdx] = enrichPendingWithQuoteSavings(nextCandid[dbIdx]!, quote);
      } else if (!nextCandid.some((s) => s.id === pending.id)) {
        nextCandid.unshift(pending);
      }
    }

    const replacing = replacementExternalServiceFromQuote(quote);
    if (replacing && !nextExternal.some((s) => s.id === replacing.id)) {
      nextExternal.unshift(replacing);
    }
  }

  return { candid: nextCandid, external: nextExternal };
}
