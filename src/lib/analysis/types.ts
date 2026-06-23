import type { ScheduleARateLine } from '@/lib/schedule-a-types';

/** Sell-rate schedule for a merchant services provider included in customer analysis. */
export type MerchantAnalysisProvider = {
  id: string;
  name: string;
  displayName?: string;
  lines: ScheduleARateLine[];
  defaultRateTemplateId?: string;
  defaultRateTemplateName?: string;
};

export type ProviderRateBreakdown = {
  volumeCost: number;
  perItemCost: number;
  monthlyFees: number;
  flatRatePct?: number;
  markupBps?: number;
};

export type ProviderSavingsQuote = {
  providerId: string;
  providerName: string;
  currentMonthlyCost: number;
  proposedMonthlyCost: number;
  monthlySavings: number;
  annualSavings: number;
  breakdown: ProviderRateBreakdown;
  matchedLines: number;
  notes: string[];
};

export type CurrentFeeLine = {
  id: string;
  section: string;
  item: string;
  amount: number;
  amountLabel: string;
  matchedRateLineId?: string;
  matchedRateItem?: string;
};

export type MerchantProviderSelection = {
  providerId: string;
  providerName: string;
  reason: string;
  riskTier: 'low' | 'mid' | 'high';
  mccCode?: string;
  mccLabel?: string;
  revenueSharePct: number;
  monthlySavings: number;
  estimatedMonthlyCommission: number;
  excludedProviders: { id: string; name: string; reason: string }[];
  applicableRiskFees: string[];
};

export type PricingStructureId =
  | 'interchange_plus'
  | 'flat_rate'
  | 'flat3'
  | 'dual_pricing';

export type ProposedCardMarkup = {
  label: string;
  markupBps: number;
  rateLabel: string;
};

export type ProposedPerItemFee = {
  label: string;
  perItem: number;
  monthlyEstimate?: number;
};

export type PricingStructureOption = {
  id: PricingStructureId;
  label: string;
  description: string;
  monthlySavings: number;
  annualSavings: number;
  estimatedCommission: number;
  currentMonthlyCost: number;
  proposedMonthlyCost: number;
  proposedRateLabel: string;
  /** Parsed markup above interchange from the merchant's statement (bps) */
  currentMarkupBps?: number;
  /** Sell markup from selected partner Our rate schedule (bps) */
  proposedMarkupBps?: number;
  /** Schedule line label for proposed markup */
  proposedMarkupSource?: string;
  /** Card-brand interchange markup lines from Our rate schedule */
  proposedCardMarkups?: ProposedCardMarkup[];
  /** Per-transaction / per-item fees from Our rate schedule */
  proposedPerItemFees?: ProposedPerItemFee[];
  /** Customer-facing dual pricing / cash discount fee (%) */
  dualCustomerFeePct?: number;
  /** Auto-calculated merchant processing rate (%) for net $0 on cards */
  merchantProcessingPct?: number;
  /** Matches the pricing model detected on the customer's statement */
  isCurrentStructure: boolean;
  /** Included in the customer proposal */
  selected: boolean;
  /** Can be toggled on — both savings and commission are non-negative */
  selectable: boolean;
  exclusionReason?: string;
};
