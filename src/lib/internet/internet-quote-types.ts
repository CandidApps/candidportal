import type {
  InternetAdditionalNeedId,
  InternetConnectionTypeId,
} from '@/lib/internet/internet-quote-config';

export type InternetQuoteWorkflowStage =
  | 'requirements'
  | 'scout_pending'
  | 'scout_received'
  | 'pricing_review'
  | 'published'
  | 'accepted'
  | 'contract_submitted';

export type InternetQuoteRequirements = {
  serviceAddress: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  connectionTypes: InternetConnectionTypeId[];
  additionalNeeds: InternetAdditionalNeedId[];
  desiredSpeed: string;
  billFilename?: string;
  billStoragePath?: string;
  analysisReviewId?: string;
};

export type InternetScoutServiceabilityLine = {
  label: string;
  statusText: string;
  statusColor?: 'green' | 'yellow' | 'red' | 'other';
  description?: string;
};

export type InternetScoutProviderCard = {
  id: string;
  roleLabel: string;
  providerName: string;
  logoUrl?: string;
  lines: InternetScoutServiceabilityLine[];
  scoutPricingUrl?: string;
  /** Yellow/green serviceability — pricing PDF expected. */
  quotable: boolean;
};

export type InternetScoutProviderRow = {
  name: string;
  accessType: string;
  distance: string;
};

export type InternetScoutLookup = {
  subject: string;
  serviceAddress: string;
  receivedAt?: string;
  providerCards: InternetScoutProviderCard[];
  availableProviders: InternetScoutProviderRow[];
  rawHtml?: string;
};

export type InternetPricingLine = {
  id: string;
  section?: string;
  label: string;
  downloadMbps?: number | null;
  uploadMbps?: number | null;
  /** Primary monthly price (typically 36-month column when present). */
  monthlyPrice?: number | null;
  termMonths?: number | null;
  notes?: string;
};

export type InternetPricingOption = {
  id: string;
  supplierName: string;
  logoUrl?: string;
  serviceAddress: string;
  lines: InternetPricingLine[];
  pdfStoragePath?: string;
  pdfFilename?: string;
  selected: boolean;
  matchScore?: number;
  matchHighlights?: string[];
  parsedRawText?: string;
  serviceabilitySummary?: string;
};

export type InternetQuoteSnapshot = {
  requirements: InternetQuoteRequirements;
  workflowStage: InternetQuoteWorkflowStage;
  scoutRequestSentAt?: string;
  scoutLookup?: InternetScoutLookup;
  pricingOptions: InternetPricingOption[];
  scoutContractSubmittedAt?: string;
  scoutContractCustomerNotifiedAt?: string;
};

export const INTERNET_QUOTE_ANSWER_KEYS = {
  connectionTypes: 'internetConnectionTypes',
  additionalNeeds: 'internetAdditionalNeeds',
  desiredSpeed: 'internetDesiredSpeed',
  serviceAddress: 'internetServiceAddress',
} as const;
