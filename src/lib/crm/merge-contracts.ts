import type { CandidContractRecord } from '@/lib/customer-records';
import { formatMerchantRateSummary, formatVolumeLabel } from '@/lib/crm/contract-service-pricing';
import { contractServiceTitle, contractRichnessScore } from '@/lib/customer-contracts-from-deals';

export type MergeFieldSide = 'a' | 'b';

export type MergeFieldKey = Exclude<
  keyof CandidContractRecord,
  'id' | 'customerId' | 'vendor' | 'monthly' | 'expires'
>;

export type MergeFieldDef = {
  key: MergeFieldKey;
  label: string;
  group: string;
  /** BMW / commission identity — prefer the deal that already has commissions. */
  sacred?: boolean;
};

/** Fields the admin can pick side-by-side when merging two deals. */
export const MERGE_FIELD_DEFS: MergeFieldDef[] = [
  { key: 'dealId', label: 'Deal ID / MID', group: 'Identity', sacred: true },
  { key: 'paySource', label: 'Pay source', group: 'Identity', sacred: true },
  { key: 'agentCommId', label: 'Agent commission ID', group: 'Identity', sacred: true },
  { key: 'agentOfRecord', label: 'Agent of record', group: 'Identity' },
  { key: 'agentCommissionRate', label: 'Agent commission rate', group: 'Identity' },

  { key: 'serviceTypeId', label: 'Service type', group: 'Service' },
  { key: 'solution', label: 'Provider / solution', group: 'Service' },
  { key: 'service', label: 'Service label', group: 'Service' },
  { key: 'product', label: 'Product', group: 'Service' },
  { key: 'solutionDescription', label: 'Description', group: 'Service' },
  { key: 'providerAccountNum', label: 'Provider account #', group: 'Service' },

  { key: 'merchantPricing', label: 'Merchant pricing', group: 'Pricing' },
  { key: 'pricingStructureId', label: 'Pricing structure', group: 'Pricing' },
  { key: 'pricingLineItems', label: 'Pricing line items', group: 'Pricing' },
  { key: 'serviceBreakdown', label: 'Service breakdown', group: 'Pricing' },
  { key: 'mrr', label: 'MRR', group: 'Pricing' },
  { key: 'mrc', label: 'MRC', group: 'Pricing' },
  { key: 'taxRatePercent', label: 'Tax rate %', group: 'Pricing' },
  { key: 'estimatedTotalBill', label: 'Estimated total bill', group: 'Pricing' },

  { key: 'candidCommissionRate', label: 'Candid commission %', group: 'Commission' },
  { key: 'commissionAmount', label: 'Commission $', group: 'Commission' },
  { key: 'spiffExpected', label: 'SPIFF', group: 'Commission' },
  { key: 'commissionType', label: 'Commission type', group: 'Commission' },

  { key: 'dealStatus', label: 'Status', group: 'Term' },
  { key: 'contractStartDate', label: 'Start date', group: 'Term' },
  { key: 'contractEndDate', label: 'End date', group: 'Term' },
  { key: 'contractTerms', label: 'Contract terms', group: 'Term' },
  { key: 'contractSignDate', label: 'Sign date', group: 'Term' },
  { key: 'contractTermMonths', label: 'Term (months)', group: 'Term' },
  { key: 'autoRenews', label: 'Auto-renews', group: 'Term' },
  { key: 'renewalNoticeDate', label: 'Renewal notice', group: 'Term' },
  { key: 'alert60Days', label: '60-day alert', group: 'Term' },

  { key: 'locationId', label: 'Location', group: 'Location' },
  { key: 'physicalLocationId', label: 'Physical location', group: 'Location' },
  { key: 'billingLocationId', label: 'Billing location', group: 'Location' },

  { key: 'salesOrderRef', label: 'Sales order ref', group: 'Other' },
  { key: 'salesOrderNum', label: 'Sales order #', group: 'Other' },
  { key: 'dealNote', label: 'Deal note', group: 'Other' },
  { key: 'equipmentNote', label: 'Equipment note', group: 'Other' },
  { key: 'contactAtSigning', label: 'Contact at signing', group: 'Other' },
  { key: 'isCandid', label: 'Candid managed', group: 'Other' },
  { key: 'portingInfo', label: 'Porting info', group: 'Other' },
];

export type MergeFieldPicks = Partial<Record<MergeFieldKey, MergeFieldSide>>;

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (value === '') return true;
  if (typeof value === 'boolean') return false;
  if (typeof value === 'number') return !Number.isFinite(value);
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  return false;
}

export function formatMergeFieldValue(
  contract: CandidContractRecord,
  key: MergeFieldKey,
  locationLabel?: (id: string) => string,
): string {
  const value = contract[key];
  if (isEmptyValue(value)) return '—';

  switch (key) {
    case 'merchantPricing': {
      const mp = contract.merchantPricing;
      const parts = [
        formatMerchantRateSummary(mp),
        formatVolumeLabel(mp?.monthlyVolume),
        mp?.monthlyFees != null ? `Fees $${mp.monthlyFees}` : null,
      ].filter(Boolean);
      return parts.join(' · ') || '—';
    }
    case 'pricingLineItems':
      return `${(contract.pricingLineItems ?? []).length} line(s)`;
    case 'serviceBreakdown':
      return 'Breakdown set';
    case 'portingInfo':
      return 'Porting details set';
    case 'locationId':
    case 'physicalLocationId':
    case 'billingLocationId': {
      const id = String(value);
      return locationLabel?.(id) || id;
    }
    case 'agentCommissionRate':
    case 'candidCommissionRate':
    case 'taxRatePercent':
      return `${value}%`;
    case 'mrr':
    case 'mrc':
    case 'estimatedTotalBill':
    case 'commissionAmount':
    case 'spiffExpected':
    case 'promoMrc':
    case 'yr1Annual':
    case 'yr2Annual':
      return typeof value === 'number'
        ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
        : String(value);
    case 'autoRenews':
    case 'isCandid':
    case 'annualBilling':
      return value ? 'Yes' : 'No';
    default:
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
  }
}

/** Prefer BMW identity for sacred fields; otherwise prefer the side that has a value / richer deal. */
export function defaultMergePicks(
  a: CandidContractRecord,
  b: CandidContractRecord,
): MergeFieldPicks {
  const aBmw = a.id.startsWith('ct-bmw-') || Boolean(a.dealId?.trim());
  const bBmw = b.id.startsWith('ct-bmw-') || Boolean(b.dealId?.trim());
  // Prefer the richer deal as default for content fields.
  const preferRich: MergeFieldSide =
    contractRichnessScore(b) > contractRichnessScore(a) ? 'b' : 'a';

  const picks: MergeFieldPicks = {};
  for (const def of MERGE_FIELD_DEFS) {
    const aEmpty = isEmptyValue(a[def.key]);
    const bEmpty = isEmptyValue(b[def.key]);
    if (aEmpty && !bEmpty) {
      picks[def.key] = 'b';
      continue;
    }
    if (bEmpty && !aEmpty) {
      picks[def.key] = 'a';
      continue;
    }
    if (aEmpty && bEmpty) {
      picks[def.key] = preferRich;
      continue;
    }
    if (def.sacred) {
      // Keep BMW / commission identity from the BMW-backed deal when possible.
      if (def.key === 'dealId' || def.key === 'paySource' || def.key === 'agentCommId') {
        if (aBmw && !bBmw) picks[def.key] = 'a';
        else if (bBmw && !aBmw) picks[def.key] = 'b';
        else if (def.key === 'dealId') {
          picks[def.key] = a.dealId && !b.dealId ? 'a' : b.dealId && !a.dealId ? 'b' : preferRich;
        } else {
          picks[def.key] = preferRich;
        }
        continue;
      }
    }
    picks[def.key] = preferRich;
  }
  return picks;
}

/** Which deal to keep as the CRM row (external_id / documents). Prefer BMW-backed. */
export function defaultKeepSide(a: CandidContractRecord, b: CandidContractRecord): MergeFieldSide {
  const aBmw = a.id.startsWith('ct-bmw-');
  const bBmw = b.id.startsWith('ct-bmw-');
  if (aBmw && !bBmw) return 'a';
  if (bBmw && !aBmw) return 'b';
  if (a.dealId && !b.dealId) return 'a';
  if (b.dealId && !a.dealId) return 'b';
  return contractRichnessScore(b) > contractRichnessScore(a) ? 'b' : 'a';
}

export function buildMergedContract(
  a: CandidContractRecord,
  b: CandidContractRecord,
  keepSide: MergeFieldSide,
  picks: MergeFieldPicks,
): CandidContractRecord {
  const keep = keepSide === 'a' ? a : b;
  const other = keepSide === 'a' ? b : a;
  const merged: CandidContractRecord = {
    ...keep,
    id: keep.id,
    customerId: keep.customerId,
  };

  for (const def of MERGE_FIELD_DEFS) {
    const side = picks[def.key] ?? keepSide;
    const source = side === 'a' ? a : b;
    const value = source[def.key];
    if (isEmptyValue(value) && !isEmptyValue(other[def.key]) && side === keepSide) {
      // If pick was keep but empty, still allow other via explicit pick only.
    }
    (merged as Record<string, unknown>)[def.key] = value;
  }

  const mrc = merged.mrc ?? merged.mrr ?? merged.monthly ?? 0;
  merged.monthly = typeof mrc === 'number' && Number.isFinite(mrc) ? mrc : keep.monthly;
  merged.vendor =
    [merged.solution, merged.product || merged.service].filter(Boolean).join(' — ') ||
    keep.vendor ||
    other.vendor;
  if (!merged.expires) {
    merged.expires = keep.expires || other.expires || '';
  }

  return merged;
}

export function mergeDealLabel(ct: CandidContractRecord): string {
  const title = contractServiceTitle(ct);
  const mid = ct.dealId?.trim();
  return mid ? `${title} (${mid})` : title;
}
