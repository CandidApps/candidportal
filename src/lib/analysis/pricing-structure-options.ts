import type { MerchantStatementForm } from '@/lib/candid-pay/merchant-analysis';
import {
  calcDualPricingFromCustomerFee,
  calcFlat3Savings,
  calcFlatRateSavings,
  merchantProcessingRateFromCustomerFee,
  PRICING_MODELS,
} from '@/lib/candid-pay/pricingEngine';
import type { StatementData } from '@/lib/candid-pay/statementParser';
import {
  estimateMonthlyCommission,
  estimateInterchangePlusCommission,
  type MerchantRiskTier,
} from '@/lib/analysis/merchant-risk';
import { calcInterchangePlusFromSchedule, proposedFixedFeesFromSchedule } from '@/lib/analysis/our-rate-savings';
import { resolveRecurringCostBasis } from '@/lib/analysis/recurring-processing-cost';
import type { PricingStructureId, PricingStructureOption, ProposedCardMarkup, ProposedPerItemFee } from '@/lib/analysis/types';
import type { ScheduleARateLine } from '@/lib/schedule-a-types';
import {
  detectedPricingStructure,
  inferPricingModelFromStatement,
} from '@/lib/analysis/statement-pricing-model';

export { detectedPricingStructure, inferPricingModelFromStatement } from '@/lib/analysis/statement-pricing-model';

export const DEFAULT_DUAL_CUSTOMER_FEE_PCT = 3.2;

const ALL_STRUCTURE_IDS: PricingStructureId[] = [
  'interchange_plus',
  'flat_rate',
  'flat3',
  'dual_pricing',
];

const STRUCTURE_LABELS: Record<PricingStructureId, { label: string; description: string }> = {
  interchange_plus: {
    label: PRICING_MODELS.interchange_plus.label,
    description: PRICING_MODELS.interchange_plus.description,
  },
  flat_rate: {
    label: PRICING_MODELS.flat_rate.label,
    description: PRICING_MODELS.flat_rate.description,
  },
  flat3: {
    label: 'Flat 3%',
    description: 'CandidPay flat 3% all-in card processing.',
  },
  dual_pricing: {
    label: 'Dual Pricing / Cash Discount',
    description:
      'Fee passed to the merchant\'s customer; merchant processing rate is set for net $0 on card volume.',
  },
};

type SavingsResult = {
  currentMonthlyCost: number;
  proposedMonthlyCost: number;
  monthlySavings: number;
  annualSavings: number;
  proposedRateLabel: string;
  commissionRevenueBasis?: number;
  dualCustomerFeePct?: number;
  merchantProcessingPct?: number;
  currentMarkupBps?: number;
  proposedMarkupBps?: number;
  proposedMarkupSource?: string;
  sellMarkupMissing?: boolean;
  proposedCardMarkups?: ProposedCardMarkup[];
  proposedPerItemFees?: ProposedPerItemFee[];
  interchangePlusCommission?: number;
};

function calcStructureSavings(
  id: PricingStructureId,
  form: MerchantStatementForm,
  dualPricingCustomerFeePct: number,
  providerLines: ScheduleARateLine[],
  statements?: StatementData[],
): SavingsResult {
  const vol = parseFloat(form.ccVolume) || 0;
  const ach = parseFloat(form.achVolume) || 0;
  const costBasis = resolveRecurringCostBasis(form, statements);
  const proposedFixed = proposedFixedFeesFromSchedule(providerLines, costBasis.transactionCount);
  const recurringRate = costBasis.recurringEffectiveRate;
  const recurringCardCost = costBasis.recurringCardMonthly;

  switch (id) {
    case 'interchange_plus': {
      const r = calcInterchangePlusFromSchedule(form, providerLines, statements);
      return {
        currentMonthlyCost: r.currentMonthlyCost,
        proposedMonthlyCost: r.proposedMonthlyCost,
        monthlySavings: r.monthlySavings,
        annualSavings: r.annualSavings,
        proposedRateLabel: r.proposedRateLabel,
        currentMarkupBps: r.currentMarkupBps,
        proposedMarkupBps: r.proposedMarkupBps ?? undefined,
        proposedMarkupSource: r.proposedMarkupSource,
        proposedCardMarkups: r.proposedCardMarkups.map((m) => ({
          label: m.label,
          markupBps: m.markupBps,
          rateLabel: m.buyRateLabel,
        })),
        proposedPerItemFees: r.proposedPerItemFees,
        sellMarkupMissing: r.sellMarkupMissing,
        commissionRevenueBasis: r.commissionRevenueBasis,
      };
    }
    case 'flat_rate': {
      const r = calcFlatRateSavings({
        currentEffectiveRate: recurringRate,
        ccVolume: vol,
        cardPresentPct: form.cardPresentPct || '60',
        currentMonthlyCost: recurringCardCost,
        proposedMonthlyFees: proposedFixed.monthlyFees,
        proposedPerItemMonthly: proposedFixed.perItemMonthly,
      });
      const fixedNote =
        proposedFixed.monthlyFees + proposedFixed.perItemMonthly > 0
          ? ` · incl. ${fmtProposedFixedNote(proposedFixed)}`
          : '';
      return {
        currentMonthlyCost: r.currentCost,
        proposedMonthlyCost: r.newCost,
        monthlySavings: r.monthlySavings,
        annualSavings: r.annualSavings,
        proposedRateLabel: `${r.blendedNewRate}% blended (${r.newInPersonRate}% CP / ${r.newOnlineRate}% CNP)${fixedNote}`,
        proposedPerItemFees: proposedFixed.perItemFees,
      };
    }
    case 'flat3': {
      const r = calcFlat3Savings({
        currentEffectiveRate: recurringRate,
        ccVolume: vol,
        currentMonthlyCost: recurringCardCost,
        proposedMonthlyFees: proposedFixed.monthlyFees,
        proposedPerItemMonthly: proposedFixed.perItemMonthly,
      });
      const fixedNote =
        proposedFixed.monthlyFees + proposedFixed.perItemMonthly > 0
          ? ` · incl. ${fmtProposedFixedNote(proposedFixed)}`
          : '';
      return {
        currentMonthlyCost: r.currentCost,
        proposedMonthlyCost: r.newCost,
        monthlySavings: r.monthlySavings,
        annualSavings: r.annualSavings,
        proposedRateLabel: `${r.flatRate}% flat${fixedNote}`,
        proposedPerItemFees: proposedFixed.perItemFees,
      };
    }
    case 'dual_pricing': {
      const feePct = dualPricingCustomerFeePct > 0 ? dualPricingCustomerFeePct : DEFAULT_DUAL_CUSTOMER_FEE_PCT;
      const r = calcDualPricingFromCustomerFee({
        customerFeePct: feePct,
        ccVolume: vol,
        achVolume: ach,
        currentEffectiveRate: recurringRate,
        currentACHRate: parseFloat(form.currentACHRate) || 1,
        currentMonthlyCost: recurringCardCost,
        proposedMonthlyFees: proposedFixed.monthlyFees,
        proposedPerItemMonthly: proposedFixed.perItemMonthly,
      });
      const procPct = r.merchantProcessingPct.toFixed(3);
      const fixedNote =
        proposedFixed.monthlyFees + proposedFixed.perItemMonthly > 0
          ? ` · ${fmtProposedFixedNote(proposedFixed)} on ACH side`
          : '';
      return {
        currentMonthlyCost: r.currentCost,
        proposedMonthlyCost: r.newCost,
        monthlySavings: r.monthlySavings,
        annualSavings: r.annualSavings,
        proposedRateLabel: `${feePct}% customer fee → ${procPct}% merchant processing (net $0 on cards)${fixedNote}`,
        commissionRevenueBasis: r.commissionRevenueBasis,
        dualCustomerFeePct: feePct,
        merchantProcessingPct: r.merchantProcessingPct,
        proposedPerItemFees: proposedFixed.perItemFees,
      };
    }
    default:
      return {
        currentMonthlyCost: recurringCardCost,
        proposedMonthlyCost: recurringCardCost,
        monthlySavings: 0,
        annualSavings: 0,
        proposedRateLabel: '—',
      };
  }
}

function fmtProposedFixedNote(fixed: {
  monthlyFees: number;
  perItemMonthly: number;
}): string {
  const parts: string[] = [];
  if (fixed.monthlyFees > 0) {
    parts.push(`$${fixed.monthlyFees.toFixed(0)}/mo platform fees`);
  }
  if (fixed.perItemMonthly > 0) {
    parts.push(`$${fixed.perItemMonthly.toFixed(0)}/mo per-item fees`);
  }
  return parts.join(' + ');
}

function buildOption(
  id: PricingStructureId,
  form: MerchantStatementForm,
  providerLines: ScheduleARateLine[],
  risk: MerchantRiskTier,
  currentStructure: PricingStructureId,
  selectedIds: Set<string>,
  dualPricingCustomerFeePct: number,
  statements?: StatementData[],
): PricingStructureOption {
  const meta = STRUCTURE_LABELS[id];
  const savings = calcStructureSavings(id, form, dualPricingCustomerFeePct, providerLines, statements);
  const commission =
    id === 'interchange_plus' && savings.proposedMarkupBps != null
      ? estimateInterchangePlusCommission(form, providerLines, risk, savings.proposedMarkupBps)
      : estimateMonthlyCommission(
          savings.commissionRevenueBasis ?? savings.proposedMonthlyCost,
          form,
          providerLines,
          risk,
        );

  let selectable = savings.monthlySavings >= 0 && commission >= 0;
  let exclusionReason: string | undefined;
  if (id === 'interchange_plus' && savings.sellMarkupMissing) {
    selectable = false;
    exclusionReason = 'No interchange markup on Our rate schedule';
  } else if (savings.monthlySavings < 0) {
    selectable = false;
    exclusionReason = 'Negative customer savings';
  } else if (commission < 0) {
    selectable = false;
    exclusionReason = 'Negative estimated commission';
  }

  return {
    id,
    label: meta.label,
    description: meta.description,
    monthlySavings: savings.monthlySavings,
    annualSavings: savings.annualSavings,
    estimatedCommission: commission,
    currentMonthlyCost: savings.currentMonthlyCost,
    proposedMonthlyCost: savings.proposedMonthlyCost,
    proposedRateLabel: savings.proposedRateLabel,
    currentMarkupBps: savings.currentMarkupBps,
    proposedMarkupBps: savings.proposedMarkupBps,
    proposedMarkupSource: savings.proposedMarkupSource,
    proposedCardMarkups: savings.proposedCardMarkups,
    proposedPerItemFees: savings.proposedPerItemFees,
    dualCustomerFeePct: savings.dualCustomerFeePct,
    merchantProcessingPct: savings.merchantProcessingPct,
    isCurrentStructure: id === currentStructure,
    selected: selectedIds.has(id),
    selectable,
    exclusionReason,
  };
}

export function normalizePricingStructureSelection(ids: string[]): string[] {
  const out = new Set<PricingStructureId>();
  for (const raw of ids) {
    if (raw === 'cash_discount') out.add('dual_pricing');
    else if (raw === 'tiered') out.add('flat_rate');
    else if (ALL_STRUCTURE_IDS.includes(raw as PricingStructureId)) out.add(raw as PricingStructureId);
  }
  return [...out];
}

export function buildPricingStructureOptions(
  form: MerchantStatementForm,
  providerLines: ScheduleARateLine[],
  risk: MerchantRiskTier,
  selectedIds?: string[],
  dualPricingCustomerFeePct: number = DEFAULT_DUAL_CUSTOMER_FEE_PCT,
  statements?: StatementData[],
): PricingStructureOption[] {
  const stmt = statements?.[statements.length - 1];
  const currentStructure = detectedPricingStructure(form.pricingModel, stmt);
  const selected = new Set<string>(selectedIds);

  if (selected.size) {
    const currentProbe = calcStructureSavings(
      currentStructure,
      form,
      dualPricingCustomerFeePct,
      providerLines,
      statements,
    );
    const currentCommission =
      currentStructure === 'interchange_plus' && currentProbe.proposedMarkupBps != null
        ? estimateInterchangePlusCommission(form, providerLines, risk, currentProbe.proposedMarkupBps)
        : estimateMonthlyCommission(
            currentProbe.commissionRevenueBasis ?? currentProbe.proposedMonthlyCost,
            form,
            providerLines,
            risk,
          );
    if (currentProbe.monthlySavings >= 0 && currentCommission >= 0 && !currentProbe.sellMarkupMissing) {
      selected.add(currentStructure);
    }
  } else {
    const defaultOption = buildOption(
      currentStructure,
      form,
      providerLines,
      risk,
      currentStructure,
      new Set(),
      dualPricingCustomerFeePct,
      statements,
    );
    if (defaultOption.selectable) {
      selected.add(currentStructure);
    } else {
      for (const id of ALL_STRUCTURE_IDS) {
        const probe = buildOption(
          id,
          form,
          providerLines,
          risk,
          currentStructure,
          new Set(),
          dualPricingCustomerFeePct,
          statements,
        );
        if (probe.selectable) {
          selected.add(id);
          break;
        }
      }
    }
  }

  return ALL_STRUCTURE_IDS.map((id) =>
    buildOption(
      id,
      form,
      providerLines,
      risk,
      currentStructure,
      selected,
      dualPricingCustomerFeePct,
      statements,
    ),
  );
}

export function defaultSelectedPricingStructures(options: PricingStructureOption[]): string[] {
  return options.filter((o) => o.selected).map((o) => o.id);
}

export function togglePricingStructureSelection(
  options: PricingStructureOption[],
  id: PricingStructureId,
  on: boolean,
): PricingStructureOption[] {
  const target = options.find((o) => o.id === id);
  if (!target?.selectable && on) return options;

  return options.map((o) => {
    if (o.id !== id) return o;
    if (!on && o.isCurrentStructure) return o;
    return { ...o, selected: on };
  });
}

export function selectedPricingStructureOptions(
  options: PricingStructureOption[],
): PricingStructureOption[] {
  return options.filter((o) => o.selected);
}

/** Customer proposal: alternatives plus current structure when partner pricing still saves money. */
export function customerFacingProposalOptions(
  options: PricingStructureOption[],
): PricingStructureOption[] {
  const selected = options.filter((o) => o.selected);
  if (!selected.length) return [];

  const alternatives = selected.filter((o) => !o.isCurrentStructure);
  const currentWithSavings = selected.filter(
    (o) => o.isCurrentStructure && o.monthlySavings > 0.005,
  );

  if (!alternatives.length) {
    return currentWithSavings.length > 0 ? currentWithSavings : selected;
  }

  const ids = new Set([...alternatives, ...currentWithSavings].map((o) => o.id));
  return selected.filter((o) => ids.has(o.id));
}

export { merchantProcessingRateFromCustomerFee };
