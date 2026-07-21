import type { UcaasQuoteSnapshot } from '@/lib/ucaas/types';
import type { PricingStructureOption } from '@/lib/analysis/types';
import type { ScheduleARateLine } from '@/lib/schedule-a-types';
import type { ProviderCategory } from '@/lib/provider-categories';

export type QuoteDeliverablePath = 'instant_ucaas' | 'manual' | 'proposal' | 'instant_merchant';

export type QuoteProposalDocument = {
  url?: string;
  name: string;
  mimeType?: string;
  storagePath?: string;
  filename?: string;
  uploadedAt?: string;
  excerpt?: string;
};

export type QuoteItemKind = 'manual' | 'upload' | 'supplier_request';

/** One quote option within a quote request — multiple allowed per request. */
export type QuoteRequestItem = {
  id: string;
  kind: QuoteItemKind;
  label?: string;
  createdAt?: string;
  serviceTypeId?: string | null;
  categories?: ProviderCategory[];
  matchedProviderSlug?: string;
  matchedProviderName?: string;
  ourRateLines?: ScheduleARateLine[];
  pricingStructureOptions?: PricingStructureOption[];
  selectedPricingStructures?: string[];
  dualPricingCustomerFeePct?: number;
  showSupplierName?: boolean;
  ucaasQuote?: UcaasQuoteSnapshot;
  proposalDocument?: QuoteProposalDocument;
  supplierRfqId?: string;
  providerId?: number;
  providerName?: string;
  contactName?: string;
  contactEmail?: string;
  rfqStatus?: 'queued' | 'sent' | 'responded';
  sentAt?: string;
  respondedAt?: string;
  responseQuote?: QuoteProposalDocument;
  responseSource?: 'body' | 'link' | 'attachment';
  internetQuote?: import('@/lib/internet/internet-quote-types').InternetQuoteSnapshot;
  merchantQuote?: QuoteMerchantSnapshot;
};

/** Parsed merchant statement attached to a manual quote (current spend vs savings). */
export type QuoteMerchantSnapshot = {
  vendorName?: string;
  filename?: string;
  statements: import('@/lib/candid-pay/statementParser').StatementData[];
  currentFeeLines: import('@/lib/analysis/types').CurrentFeeLine[];
};

/** Structured quote deliverable published to the customer portal. */
export type PublishedQuoteSnapshot = {
  serviceTypeId: string | null;
  serviceLabel: string;
  adminMessage?: string;
  quotePath: QuoteDeliverablePath;
  quoteItems?: QuoteRequestItem[];
  ucaasQuote?: UcaasQuoteSnapshot;
  proposalDocument?: QuoteProposalDocument;
  publishedAt?: string;
  categories?: ProviderCategory[];
  matchedProviderSlug?: string;
  matchedProviderName?: string;
  ourRateLines?: ScheduleARateLine[];
  pricingStructureOptions?: PricingStructureOption[];
  selectedPricingStructures?: string[];
  dualPricingCustomerFeePct?: number;
  showSupplierName?: boolean;
  internetQuote?: import('@/lib/internet/internet-quote-types').InternetQuoteSnapshot;
  merchantQuote?: QuoteMerchantSnapshot;
};

export type QuoteSupplierRfqRow = {
  id: string;
  quote_request_id: string;
  quote_item_id?: string | null;
  provider_id: number | null;
  provider_name: string;
  contact_name: string | null;
  contact_email: string;
  status: 'draft' | 'queued' | 'sent' | 'responded';
  rfq_subject: string | null;
  email_body?: string | null;
  sent_at: string;
  responded_at?: string | null;
  response_source?: string | null;
  response_quote?: QuoteProposalDocument | null;
  response_message_id?: string | null;
  created_at: string;
};

export type QuoteSupplierOption = {
  providerId: number;
  providerSlug: string;
  providerName: string;
  contactId: number;
  contactName: string;
  contactEmail: string;
  contactRole: string;
  clientFacing: boolean;
  categoryId: string | null;
};
