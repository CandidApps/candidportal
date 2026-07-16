import {
  CANDID_CATEGORY_OFFERS,
  TECH_CATEGORY_LABELS,
  type TechSpendCategory,
} from '@/lib/plaid/categorize';
import type { ServiceCardModel } from '@/lib/services/account-services';

export type SpendTxnLite = {
  amount: number;
  date: string;
  name: string | null;
  merchant_name: string | null;
  tech_category: string | null;
  candid_related: boolean | null;
  matched_service_hint: string | null;
};

export type TechSpendFlag = {
  id: string;
  severity: 'high' | 'medium' | 'info';
  title: string;
  detail: string;
  vendorLabel: string;
  categoryLabel?: string;
  category?: TechSpendCategory | string | null;
  contractMonthly: number | null;
  observedMonthly: number;
  priorMonthly?: number | null;
  delta: number | null;
  savingsPct?: number | null;
  estimatedMonthlySavings?: number | null;
  serviceId?: string;
  /** Suggested next step for the member UI. */
  action: 'review_bill' | 'find_solutions' | 'submit_review' | 'review_services';
};

function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(inc|llc|ltd|corp|co|the|payment|payments|bill|billing)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseAmountLabel(raw?: string | null): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function merchantKey(txn: SpendTxnLite): string {
  return normalizeName(txn.merchant_name || txn.name || 'unknown') || 'unknown';
}

function namesOverlap(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const aTokens = new Set(a.split(' ').filter((t) => t.length > 2));
  const bTokens = b.split(' ').filter((t) => t.length > 2);
  let hits = 0;
  for (const t of bTokens) if (aTokens.has(t)) hits += 1;
  return hits >= 1 && hits >= Math.min(2, bTokens.length);
}

function serviceMatchKey(svc: ServiceCardModel): string {
  return normalizeName([svc.vendor, svc.name, svc.productName].filter(Boolean).join(' '));
}

type MerchantAgg = {
  key: string;
  label: string;
  total90: number;
  total30: number;
  totalPrior30: number;
  count90: number;
  category: string | null;
  hint: string | null;
};

function aggregateMerchants(
  txns: SpendTxnLite[],
  days30Cutoff: string,
  days60Cutoff: string,
): Map<string, MerchantAgg> {
  const map = new Map<string, MerchantAgg>();
  for (const t of txns) {
    if (!t.tech_category || t.tech_category === 'non_tech') continue;
    const key = merchantKey(t);
    const label = (t.merchant_name || t.name || 'Unknown vendor').trim();
    const amt = Math.abs(Number(t.amount) || 0);
    const prev = map.get(key) ?? {
      key,
      label,
      total90: 0,
      total30: 0,
      totalPrior30: 0,
      count90: 0,
      category: t.tech_category,
      hint: t.matched_service_hint,
    };
    prev.total90 += amt;
    prev.count90 += 1;
    if (t.date >= days30Cutoff) {
      prev.total30 += amt;
    } else if (t.date >= days60Cutoff) {
      prev.totalPrior30 += amt;
    }
    if (!prev.category && t.tech_category) prev.category = t.tech_category;
    if (!prev.hint && t.matched_service_hint) prev.hint = t.matched_service_hint;
    map.set(key, prev);
  }
  return map;
}

function formatUsd(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function candidOfferFor(category: string | null | undefined) {
  if (!category) return null;
  return CANDID_CATEGORY_OFFERS[category as TechSpendCategory] ?? null;
}

/**
 * Build member-facing action flags from Plaid tech spend + portal services/contracts.
 * — Contract vs bank spikes
 * — Month-over-month merchant flux
 * — Candid solution opportunities (e.g. phone → ~25% average savings)
 */
export function buildTechSpendFlags(
  transactions: SpendTxnLite[],
  services: ServiceCardModel[],
  opts?: { now?: Date },
): TechSpendFlag[] {
  const now = opts?.now ?? new Date();
  const d30 = new Date(now);
  d30.setDate(d30.getDate() - 30);
  const d60 = new Date(now);
  d60.setDate(d60.getDate() - 60);
  const days30Cutoff = d30.toISOString().slice(0, 10);
  const days60Cutoff = d60.toISOString().slice(0, 10);

  const merchants = aggregateMerchants(transactions, days30Cutoff, days60Cutoff);
  const flags: TechSpendFlag[] = [];
  const flaggedKeys = new Set<string>();

  for (const svc of services) {
    const contractMonthly = parseAmountLabel(svc.amountBeforeTax ?? svc.amount);
    if (contractMonthly == null) continue;
    const svcKey = serviceMatchKey(svc);
    if (!svcKey) continue;

    let best: MerchantAgg | null = null;
    for (const m of merchants.values()) {
      if (!namesOverlap(svcKey, m.key) && !namesOverlap(svcKey, normalizeName(m.label))) continue;
      if (!best || m.total30 > best.total30) best = m;
    }
    if (!best) continue;
    flaggedKeys.add(best.key);

    const observedMonthly = best.total30 > 0 ? best.total30 : best.total90 / 3;
    const delta = observedMonthly - contractMonthly;
    const ratio = contractMonthly > 0 ? observedMonthly / contractMonthly : 0;
    if (delta < 40 || ratio < 1.25) continue;

    flags.push({
      id: `spike-${svc.id}-${best.key}`,
      severity: ratio >= 2 || delta >= 200 ? 'high' : 'medium',
      title: `${best.label}: bank spend above contract`,
      detail: `Your ${svc.name} contract shows about ${formatUsd(contractMonthly)}/mo, but bank activity looks closer to ${formatUsd(observedMonthly)} over the last 30 days. Candid can review the charge, dispute unexpected fees, and help you upgrade or change services so you’re not overpaying.`,
      vendorLabel: best.label,
      category: best.category,
      categoryLabel:
        TECH_CATEGORY_LABELS[(best.category as TechSpendCategory) ?? 'other_tech'] ?? undefined,
      contractMonthly,
      observedMonthly,
      delta,
      serviceId: svc.id,
      action: 'review_bill',
    });
  }

  // Significant month-over-month flux on a supplier/merchant.
  for (const m of merchants.values()) {
    if (flaggedKeys.has(m.key)) continue;
    const current = m.total30;
    const prior = m.totalPrior30;
    if (prior < 40 || current < 20) continue;
    const delta = current - prior;
    const absDelta = Math.abs(delta);
    const ratio = prior > 0 ? current / prior : 0;
    // Flag ±25% moves with at least $40 absolute change.
    if (absDelta < 40 || (ratio > 0.75 && ratio < 1.25)) continue;

    const up = delta > 0;
    const pct = Math.round(Math.abs(ratio - 1) * 100);
    flaggedKeys.add(m.key);

    const offer = candidOfferFor(m.category);
    const savingsPct = offer?.savingsPct ?? null;
    const estimatedMonthlySavings =
      savingsPct != null && current > 0 ? Math.round((current * savingsPct) / 100) : null;

    flags.push({
      id: `flux-${m.key}`,
      severity: up && (pct >= 50 || absDelta >= 150) ? 'high' : up ? 'medium' : 'info',
      title: up
        ? `${m.label}: spend up ${pct}% month over month`
        : `${m.label}: spend down ${pct}% month over month`,
      detail: up
        ? `Last 30 days look like ${formatUsd(current)} vs ${formatUsd(prior)} the month before. We’re your concierge here — Candid can review the increase, dispute unexpected charges, or check whether a better plan is available.${
            offer
              ? ` Customers typically save about ${offer.savingsPct}% on ${offer.solutionLabel} vs existing ${TECH_CATEGORY_LABELS[m.category as TechSpendCategory] ?? 'tech'} spend.`
              : ''
          }`
        : `Last 30 days look like ${formatUsd(current)} vs ${formatUsd(prior)} the month before. Worth confirming nothing important was cancelled — Candid can also help right-size or switch services if this drop is intentional.`,
      vendorLabel: m.label,
      category: m.category,
      categoryLabel: TECH_CATEGORY_LABELS[(m.category as TechSpendCategory) ?? 'other_tech'],
      contractMonthly: null,
      observedMonthly: current,
      priorMonthly: prior,
      delta,
      savingsPct,
      estimatedMonthlySavings,
      action: up ? (offer ? 'submit_review' : 'review_bill') : 'review_services',
    });
  }

  // Unmanaged tech merchants — Candid solution opportunity with avg savings callout.
  for (const m of merchants.values()) {
    if (flaggedKeys.has(m.key)) continue;
    const monthly = m.total30 > 0 ? m.total30 : m.total90 / 3;
    if (monthly < 40) continue;
    const offer = candidOfferFor(m.category);
    if (!offer) continue;

    const estimatedMonthlySavings = Math.round((monthly * offer.savingsPct) / 100);
    const isPhone = m.category === 'telecom';

    flags.push({
      id: `unmanaged-${m.key}`,
      severity: 'info',
      title: isPhone
        ? `${m.label}: phone spend — Candid can usually save ~${offer.savingsPct}%`
        : `${m.label}: Candid ${offer.solutionLabel} opportunity`,
      detail: isPhone
        ? `We’re seeing about ${formatUsd(monthly)}/mo in phone / UCaaS charges. Candid saves customers on average ${offer.savingsPct}% versus their existing phone bill — roughly ${formatUsd(estimatedMonthlySavings)}/mo (${formatUsd(estimatedMonthlySavings * 12)}/yr) if this spend is typical. Submit it for review and we’ll advocate on your behalf: compare options, negotiate, or migrate you to a better fit.`
        : `We’re seeing about ${formatUsd(monthly)}/mo in ${TECH_CATEGORY_LABELS[m.category as TechSpendCategory] ?? 'tech'} spend that isn’t tied to a managed service in your portal. ${offer.blurb} Average savings run about ${offer.savingsPct}% (~${formatUsd(estimatedMonthlySavings)}/mo). Submit to Candid for review and we’ll check disputes, upgrades, and better pricing.`,
      vendorLabel: m.label,
      category: m.category,
      categoryLabel: TECH_CATEGORY_LABELS[m.category as TechSpendCategory],
      contractMonthly: null,
      observedMonthly: monthly,
      delta: null,
      savingsPct: offer.savingsPct,
      estimatedMonthlySavings,
      action: 'submit_review',
    });
  }

  const severityRank = { high: 0, medium: 1, info: 2 } as const;
  flags.sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity] || b.observedMonthly - a.observedMonthly,
  );
  return flags.slice(0, 14);
}
