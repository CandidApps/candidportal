import type { PricingStructureId, PricingStructureOption } from '@/lib/analysis/types';
import type { PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';
import { QUOTE_SERVICE_TYPES } from '@/lib/quote-flow-config';

/** Aligns with quote-flow-config / quote_requests.service_type_id */
export type ContractServiceTypeId =
  | 'internet'
  | 'ucaas'
  | 'merchant'
  | 'cloud'
  | 'security'
  | 'other';

export type ContractMerchantPricing = {
  monthlyVolume?: number;
  avgTicket?: number;
  pricingStructureId?: PricingStructureId;
  /** Interchange-plus markup in basis points */
  markupBps?: number;
  /** Flat / blended rate as percent of volume */
  ratePercent?: number;
  /** Dual pricing — customer-facing fee % */
  dualCustomerFeePct?: number;
  /** Fixed monthly fees (PCI, statement, etc.) */
  monthlyFees?: number;
};

export const PRICING_STRUCTURE_OPTIONS: { id: PricingStructureId; label: string }[] = [
  { id: 'interchange_plus', label: 'Interchange Plus' },
  { id: 'flat_rate', label: 'Flat Rate' },
  { id: 'flat3', label: 'Flat 3%' },
  { id: 'dual_pricing', label: 'Dual Pricing' },
];

export function pricingStructureLabel(id: PricingStructureId | string | null | undefined): string {
  if (!id) return '';
  return PRICING_STRUCTURE_OPTIONS.find((o) => o.id === id)?.label ?? String(id);
}

export function contractServiceTypeLabel(id: string | null | undefined): string {
  if (!id) return '';
  return QUOTE_SERVICE_TYPES.find((t) => t.id === id)?.label ?? id;
}

export function isMerchantServiceType(serviceTypeId: string | null | undefined): boolean {
  return serviceTypeId === 'merchant';
}

export function inferServiceTypeIdFromText(...parts: (string | null | undefined)[]): ContractServiceTypeId | '' {
  const blob = parts.filter(Boolean).join(' ').toLowerCase();
  if (!blob.trim()) return '';
  if (/merchant|processing|payments|credit card|card processing|mid\b/.test(blob)) return 'merchant';
  if (/ucaas|phone|voip|dialpad|ringcentral|vonage/.test(blob)) return 'ucaas';
  if (/internet|broadband|fiber|coax|connectivity/.test(blob)) return 'internet';
  if (/m365|microsoft 365|google workspace|cloud/.test(blob)) return 'cloud';
  if (/security|cyber|edr|siem/.test(blob)) return 'security';
  return '';
}

/** Estimated monthly processing cost from volume + structure. */
export function estimateMerchantMonthlyCost(pricing: ContractMerchantPricing | null | undefined): number | undefined {
  if (!pricing?.monthlyVolume || pricing.monthlyVolume <= 0) return undefined;
  const volume = pricing.monthlyVolume;
  const fees = pricing.monthlyFees ?? 0;
  const structure = pricing.pricingStructureId;

  if (structure === 'interchange_plus' && pricing.markupBps != null) {
    return Math.round((volume * (pricing.markupBps / 10_000) + fees) * 100) / 100;
  }
  if ((structure === 'flat_rate' || structure === 'flat3') && pricing.ratePercent != null) {
    return Math.round((volume * (pricing.ratePercent / 100) + fees) * 100) / 100;
  }
  if (structure === 'flat3' && pricing.ratePercent == null) {
    return Math.round((volume * 0.03 + fees) * 100) / 100;
  }
  if (structure === 'dual_pricing' && pricing.dualCustomerFeePct != null) {
    const merchantPct = Math.max(0, 100 - pricing.dualCustomerFeePct) / 100;
    return Math.round((volume * merchantPct * 0.03 + fees) * 100) / 100;
  }
  if (pricing.ratePercent != null) {
    return Math.round((volume * (pricing.ratePercent / 100) + fees) * 100) / 100;
  }
  if (pricing.markupBps != null) {
    return Math.round((volume * (pricing.markupBps / 10_000) + fees) * 100) / 100;
  }
  return fees > 0 ? fees : undefined;
}

export function formatMerchantRateSummary(
  pricing: ContractMerchantPricing | null | undefined,
): string | undefined {
  if (!pricing?.pricingStructureId) return undefined;
  const label = pricingStructureLabel(pricing.pricingStructureId);
  if (pricing.pricingStructureId === 'interchange_plus' && pricing.markupBps != null) {
    return `${label} · ${pricing.markupBps} bps markup`;
  }
  if ((pricing.pricingStructureId === 'flat_rate' || pricing.pricingStructureId === 'flat3') && pricing.ratePercent != null) {
    return `${label} · ${pricing.ratePercent}%`;
  }
  if (pricing.pricingStructureId === 'flat3' && pricing.ratePercent == null) {
    return `${label} · 3%`;
  }
  if (pricing.pricingStructureId === 'dual_pricing' && pricing.dualCustomerFeePct != null) {
    return `${label} · ${pricing.dualCustomerFeePct}% customer fee`;
  }
  return label;
}

export function formatVolumeLabel(volume: number | null | undefined): string | undefined {
  if (volume == null || !Number.isFinite(volume) || volume <= 0) return undefined;
  return `$${volume.toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo volume`;
}

export function merchantPricingFromStructureOption(
  option: PricingStructureOption,
  volume: number,
  monthlyFees = 0,
): ContractMerchantPricing {
  const pricing: ContractMerchantPricing = {
    monthlyVolume: volume,
    pricingStructureId: option.id,
    monthlyFees: monthlyFees > 0 ? monthlyFees : undefined,
  };
  if (option.id === 'interchange_plus') {
    pricing.markupBps = option.proposedMarkupBps ?? option.currentMarkupBps;
  } else if (option.id === 'flat_rate' || option.id === 'flat3') {
    if (option.merchantProcessingPct != null) {
      pricing.ratePercent = option.merchantProcessingPct;
    } else if (option.id === 'flat3') {
      pricing.ratePercent = 3;
    }
  } else if (option.id === 'dual_pricing' && option.dualCustomerFeePct != null) {
    pricing.dualCustomerFeePct = option.dualCustomerFeePct;
  }
  return pricing;
}

function parsePositiveNumber(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === 'string') {
    const n = Number(raw.replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  return undefined;
}

function selectedPricingStructureOption(
  options: PricingStructureOption[] | null | undefined,
): PricingStructureOption | undefined {
  if (!options?.length) return undefined;
  const selected = options.filter((o) => o.selected && !o.isCurrentStructure);
  if (selected.length) return selected[0];
  return options.find((o) => o.selected) ?? options.find((o) => !o.isCurrentStructure) ?? options[0];
}

function providerCategoryToServiceTypeId(
  category: string | null | undefined,
): ContractServiceTypeId | '' {
  switch (category) {
    case 'merchant_services':
      return 'merchant';
    case 'ucaas':
      return 'ucaas';
    case 'internet':
      return 'internet';
    case 'cloud_saas':
      return 'cloud';
    case 'security':
      return 'security';
    default:
      return '';
  }
}

export type PipelineContractExtras = {
  serviceTypeId?: ContractServiceTypeId | string;
  merchantPricing?: ContractMerchantPricing;
  pricingStructureId?: PricingStructureId;
  estimatedMonthly?: number;
};

/** Pull service type + merchant pricing from a published bill analysis snapshot. */
export function pipelineExtrasFromAnalysisSnapshot(
  snap: PublishedAnalysisSnapshot | null | undefined,
): PipelineContractExtras {
  if (!snap) return {};
  const serviceTypeId =
    providerCategoryToServiceTypeId(snap.category) ||
    (snap.merchantAnalysis ? 'merchant' : '') ||
    inferServiceTypeIdFromText(snap.categoryLabel, snap.vendorName, snap.summary);

  const volume =
    parsePositiveNumber(snap.merchantAnalysis?.form?.ccVolume) ??
    parsePositiveNumber(snap.merchantAnalysis?.statements?.[0]?.totalVolume);

  const option = selectedPricingStructureOption(snap.pricingStructureOptions);
  if (serviceTypeId === 'merchant' && option && volume) {
    const monthlyFees =
      option.proposedPerItemFees?.reduce((sum, f) => sum + (f.monthlyEstimate ?? 0), 0) ?? 0;
    const merchantPricing = merchantPricingFromStructureOption(option, volume, monthlyFees);
    const estimatedMonthly =
      option.proposedMonthlyCost > 0
        ? option.proposedMonthlyCost
        : estimateMerchantMonthlyCost(merchantPricing);
    return {
      serviceTypeId: 'merchant',
      merchantPricing,
      pricingStructureId: option.id,
      estimatedMonthly,
    };
  }

  return serviceTypeId ? { serviceTypeId } : {};
}

/** Pull service type + merchant volume from quote request fields. */
export function pipelineExtrasFromQuoteRequest(row: {
  service_type_id?: string | null;
  service_answers?: Record<string, string | boolean> | null;
}): PipelineContractExtras {
  const serviceTypeId = row.service_type_id?.trim() || '';
  if (!serviceTypeId) return {};
  const answers = row.service_answers ?? {};
  if (serviceTypeId !== 'merchant') return { serviceTypeId };
  const volume = parsePositiveNumber(answers.monthlyVolume);
  if (!volume) return { serviceTypeId: 'merchant' };
  return {
    serviceTypeId: 'merchant',
    merchantPricing: { monthlyVolume: volume },
  };
}
