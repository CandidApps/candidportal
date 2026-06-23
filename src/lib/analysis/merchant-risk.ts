import { classifyMCC, SCHEDULE_A } from '@/lib/candid-pay/pricingEngine';
import type { ScheduleARateLine } from '@/lib/schedule-a-types';

export type MerchantRiskTier = 'low' | 'mid' | 'high';

export function riskTierFromMcc(mcc?: string | number | null): {
  tier: MerchantRiskTier;
  mccCode: string;
  label: string;
} {
  const code = mcc != null ? String(mcc).trim() : '';
  if (!code) {
    return { tier: 'low', mccCode: '', label: 'Not specified (defaulting to Low risk)' };
  }
  const info = classifyMCC(code);
  const tier = (info.risk as MerchantRiskTier) || 'mid';
  return { tier, mccCode: code, label: info.label };
}

function parseSharePct(raw?: string | null): number | null {
  if (!raw) return null;
  const m = raw.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) : null;
}

/** Enterprise ISO / SELECTED TIER revenue share for card processing by risk. */
export function resellerRevenueSharePct(
  lines: ScheduleARateLine[],
  risk: MerchantRiskTier,
  product: 'card' | 'ach' = 'card',
): number {
  const riskKey =
    product === 'ach'
      ? 'gateway & ach'
      : risk === 'low'
        ? 'low risk'
        : risk === 'mid'
          ? 'mid risk'
          : 'high risk';

  const tierLines = lines.filter((l) => {
    if (l.section !== 'Reseller Compensation Tier') return false;
    const item = l.item.toLowerCase();
    return item.includes(riskKey) && item.includes('revenue share');
  });

  const enterprise = tierLines.find(
    (l) =>
      l.notes?.includes('Enterprise ISO') ||
      l.notes?.includes('SELECTED TIER') ||
      l.item.includes('Enterprise ISO'),
  );
  const pick = enterprise ?? tierLines[0];
  return parseSharePct(pick?.revenueShare) ?? (risk === 'low' ? 99 : risk === 'mid' ? 85 : 65);
}

export function applicableRiskFeeLines(
  lines: ScheduleARateLine[],
  risk: MerchantRiskTier,
): ScheduleARateLine[] {
  if (risk === 'low') return [];
  const riskSection = lines.filter((l) => l.section === 'Risk' || l.section === 'Additional Costs');
  return riskSection.filter((l) => {
    const item = l.item.toLowerCase();
    if (risk === 'mid') {
      return item.includes('mid risk') && item.includes('bin');
    }
    return (
      item.includes('high risk') ||
      item.includes('sponsor bank risk premium')
    );
  });
}

export function estimateCandidBuyCost(
  form: { ccVolume: string; achVolume?: string; transactionCount: string },
  risk: MerchantRiskTier,
  extraRiskLines: ScheduleARateLine[] = [],
): number {
  const vol = parseFloat(form.ccVolume) || 0;
  const achVol = parseFloat(form.achVolume ?? '0') || 0;
  const txn = parseFloat(form.transactionCount) || Math.max(1, Math.round(vol / 75));
  const riskCfg = SCHEDULE_A.risk[risk] ?? SCHEDULE_A.risk.low;

  const interchangeCost = vol * (SCHEDULE_A.cc.interchangeMarkupBps / 10000);
  const perTxnCost =
    txn * (SCHEDULE_A.cc.transactionFee + SCHEDULE_A.cc.authFee + SCHEDULE_A.cc.avsFee);
  const fixedMonthly =
    SCHEDULE_A.cc.accountMaintenanceMonthly +
    SCHEDULE_A.cc.onlineReportingMonthly +
    SCHEDULE_A.cc.pciComplianceMonthly +
    SCHEDULE_A.cc.annualFeeMonthly +
    SCHEDULE_A.cc.reporting1099kMonthly;
  const binCost = vol * (riskCfg.binMonitoringBps / 10000);
  let extra = 0;
  for (const line of extraRiskLines) {
    const rate = line.buyRate.toLowerCase();
    if (rate.includes('bps')) {
      const bps = parseFloat(rate);
      if (!Number.isNaN(bps)) extra += vol * (bps / 10000);
    } else if (rate.includes('%')) {
      const pct = parseFloat(rate);
      if (!Number.isNaN(pct)) extra += vol * (pct / 100);
    } else if (rate.includes('/mo') || rate.includes('monthly')) {
      const m = rate.match(/\$?\s*(\d+(?:\.\d+)?)/);
      if (m) extra += parseFloat(m[1]);
    }
  }

  const achCost =
    SCHEDULE_A.ach.gatewayMonthly +
    SCHEDULE_A.ach.achEnabledMonthly +
    Math.round(achVol / 500) * SCHEDULE_A.ach.transactionFee;

  return interchangeCost + perTxnCost + fixedMonthly + binCost + riskCfg.monthlyFee + extra + achCost;
}

export function estimateMonthlyCommission(
  /** Merchant payment or program gross revenue (before buy costs), depending on pricing model */
  revenueBasis: number,
  form: { ccVolume: string; achVolume?: string; transactionCount: string },
  providerLines: ScheduleARateLine[],
  risk: MerchantRiskTier,
): number {
  const revenueSharePct = resellerRevenueSharePct(providerLines, risk) / 100;
  const riskFees = applicableRiskFeeLines(providerLines, risk);
  const buyCost = estimateCandidBuyCost(form, risk, riskFees);
  const margin = revenueBasis - buyCost;
  return margin * revenueSharePct;
}

/** Commission on interchange-plus markup spread (not full card processing buy cost). */
export function estimateInterchangePlusCommission(
  form: { ccVolume: string },
  providerLines: ScheduleARateLine[],
  risk: MerchantRiskTier,
  sellMarkupBps: number,
): number {
  const vol = parseFloat(form.ccVolume) || 0;
  if (!vol || !sellMarkupBps) return 0;

  const revenueSharePct = resellerRevenueSharePct(providerLines, risk) / 100;
  const grossMarkup = vol * (sellMarkupBps / 10000);
  const buyMarkup = vol * (SCHEDULE_A.cc.interchangeMarkupBps / 10000);
  return Math.max(0, (grossMarkup - buyMarkup) * revenueSharePct);
}
