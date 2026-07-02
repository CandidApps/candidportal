import type { UcaasQuoteSnapshot } from '@/lib/ucaas/types';

export type QuoteDeliverablePath = 'instant_ucaas' | 'manual' | 'proposal';

export type QuoteProposalDocument = {
  url: string;
  name: string;
  mimeType?: string;
};

/** Structured quote deliverable published to the customer portal. */
export type PublishedQuoteSnapshot = {
  serviceTypeId: string | null;
  serviceLabel: string;
  adminMessage?: string;
  quotePath: QuoteDeliverablePath;
  ucaasQuote?: UcaasQuoteSnapshot;
  proposalDocument?: QuoteProposalDocument;
  publishedAt?: string;
};

export type QuoteSupplierRfqRow = {
  id: string;
  quote_request_id: string;
  provider_id: number | null;
  provider_name: string;
  contact_name: string | null;
  contact_email: string;
  status: 'draft' | 'sent';
  rfq_subject: string | null;
  sent_at: string;
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
