import type { ProviderCategory } from '@/lib/provider-categories';
import type { MerchantAnalysisSnapshot } from '@/lib/candid-pay/merchant-analysis';
import type { StatementData } from '@/lib/candid-pay/statementParser';
import type { ScheduleARateLine } from '@/lib/schedule-a-types';
import type { ProviderSavingsQuote, MerchantProviderSelection, CurrentFeeLine, PricingStructureOption } from '@/lib/analysis/types';
import type { UcaasQuoteSnapshot } from '@/lib/ucaas/types';

export type BillParseConfidence = 'high' | 'medium' | 'low';

export type BillParseLineItem = {
  label: string;
  value: string;
  quantity?: string | null;
};

/** Shown when the parser is uncertain — customer can answer in the notes field. */
export type BillParseFlag = {
  question: string;
  severity?: 'medium' | 'high';
};

export type BillParseCustomerConfirmation = {
  notes?: string;
  confirmedAt: string;
  /** UCaaS: numbers the customer wants to port. */
  porting?: BillParsePortingSelection;
};

export type BillParsePhoneLine = {
  /** Display-friendly phone number as printed on the bill. */
  number: string;
  label?: string;
  isPrimary?: boolean;
};

export type BillParsePortingSelection = {
  portAll: boolean;
  selectedNumbers: string[];
};

export type BillParseResult = {
  category: ProviderCategory | 'other';
  categoryLabel: string;
  confidence: BillParseConfidence;
  vendorName?: string;
  /** Card/ACH processor or supplier as printed on the document (e.g. Worldpay) */
  processorName?: string;
  serviceName?: string;
  monthlyAmount?: number;
  summary?: string;
  /** Structured line items when available; UI falls back to derived rows. */
  lineItems?: BillParseLineItem[];
  /** Parser uncertainty — surfaced as questions for the customer. */
  flags?: BillParseFlag[];
  customerConfirmation?: BillParseCustomerConfirmation;
  /** UCaaS bills: phone numbers detected for porting review. */
  ucaasPhoneLines?: BillParsePhoneLine[];
  /** Populated when category is merchant_services */
  merchantStatement?: StatementData;
};

export type AnalysisReviewStatus = 'pending_review' | 'in_progress' | 'published' | 'dismissed';

export type AnalysisProposalDocument = {
  filename: string;
  storagePath: string;
  mimeType?: string;
  uploadedAt?: string;
};

export type PublishedAnalysisSnapshot = {
  category: ProviderCategory | 'other';
  categoryLabel: string;
  /** Admin-selected categories (multi-select). Primary category remains in `category`. */
  categories?: ProviderCategory[];
  categoriesLabel?: string;
  vendorName: string;
  summary?: string;
  merchantAnalysis?: MerchantAnalysisSnapshot;
  providerQuotes?: ProviderSavingsQuote[];
  ourRateLines?: ScheduleARateLine[];
  matchedProviderSlug?: string;
  matchedProviderName?: string;
  /** Selected partner rate template for merchant analysis */
  rateTemplateId?: string;
  rateTemplateName?: string;
  providerSelection?: MerchantProviderSelection;
  currentFeeLines?: CurrentFeeLine[];
  pricingStructureOptions?: PricingStructureOption[];
  selectedPricingStructures?: string[];
  /** Customer fee % for dual pricing / cash discount (e.g. 3.2) */
  dualPricingCustomerFeePct?: number;
  /**
   * When false (default), processor/supplier names are hidden on the customer savings
   * estimate — only rates and savings are shown. Enable when sending an official
   * proposal where naming the supplier is appropriate.
   */
  showSupplierName?: boolean;
  /** Structured UCaaS quote (Vonage-style configurator) for telecom categories. */
  ucaasQuote?: UcaasQuoteSnapshot;
  adminMessage?: string;
  proposalDocument?: AnalysisProposalDocument;
  publishedAt: string;
};

export type BillAnalysisReviewRow = {
  id: string;
  user_id: string;
  account_service_id: string | null;
  /** CRM `customers.external_id` when known (portal scope / account service). */
  crm_customer_id?: string | null;
  customer_email: string | null;
  customer_name: string | null;
  vendor_name: string;
  filename: string | null;
  bill_storage_path: string | null;
  detected_category: string;
  category_label: string | null;
  detected_categories: string[] | null;
  parse_result: BillParseResult;
  draft_snapshot: PublishedAnalysisSnapshot | null;
  published_snapshot: PublishedAnalysisSnapshot | null;
  matched_provider_slug: string | null;
  status: AnalysisReviewStatus;
  admin_notes: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  customer_notified_at: string | null;
  /** Set when the customer accepts the published quote/proposal. */
  customer_accepted_at?: string | null;
  customer_acceptance?: import('@/lib/quotes/quote-acceptance').QuoteCustomerAcceptance | null;
  created_at: string;
  updated_at: string;
};

export type MemberNotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  account_service_id: string | null;
  analysis_review_id: string | null;
  read_at: string | null;
  created_at: string;
};
