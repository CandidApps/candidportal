import type { ServiceCardModel } from '@/lib/services/account-services';
import {
  accountRecurringMonthlySavings,
  formatSavingsMoney,
  quoteSavingsPreview,
} from '@/lib/services/quote-savings';
import { computeServiceSavingsDisplay } from '@/lib/services/service-savings';

function parseMoney(v?: string): number {
  if (!v) return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export type MemberServicesSnapshot = {
  monthlySavings: number;
  yearlySavings: number;
  monthlyItSpend: number;
  yearlyItSpend: number;
  /** Tech-spend this calendar month (when available). */
  techSpendThisMonth: number | null;
  /** Tech-spend prior calendar month (when available). */
  techSpendLastMonth: number | null;
  techSpendMomDelta: number | null;
  techSpendMomPct: number | null;
  expiredCount: number;
  expiringCount: number;
  pendingContractCount: number;
  candidManagedCount: number;
  externalCount: number;
  savingsServiceCount: number;
  /** monthlySavings / monthlyItSpend as 0–100, when both > 0. */
  savingsRatePct: number | null;
  /** Monthly $ still on services not fully with Candid (external / being replaced). */
  outsideCandidMonthly: number;
  /** Monthly $ on services marked being replaced (accepted quote in flight). */
  beingReplacedMonthly: number;
  /** Soonest renewal/expiry label for active services, if any. */
  nextRenewalLabel: string | null;
};

export function buildMemberServicesSnapshot(
  services: ServiceCardModel[],
  opts?: {
    accountSavings?: number | null;
    techSpendThisMonth?: number | null;
    techSpendLastMonth?: number | null;
  },
): MemberServicesSnapshot {
  const active = services.filter((s) => s.status !== 'inactive');
  const candidManaged = active.filter((s) => s.candidManaged);
  const external = active.filter((s) => !s.candidManaged);

  const recurring = accountRecurringMonthlySavings(active, opts?.accountSavings ?? null);

  // Prefer adjusted/current display savings per service when available.
  let monthlyFromCards = 0;
  let savingsServiceCount = 0;
  for (const svc of candidManaged) {
    if (svc.savingsOpportunityOnly) continue;
    if (svc.pending && !svc.pendingContract) continue;
    const display = computeServiceSavingsDisplay({
      snapshot: svc.analysisSnapshot ?? null,
      baseline: svc.savingsBaseline ?? null,
      addedSeatCount: svc.addedSeatCount ?? 0,
    });
    const monthly =
      display?.adjusted?.monthly ??
      display?.original.monthly ??
      quoteSavingsPreview(svc)?.monthly ??
      0;
    if (monthly > 0) {
      monthlyFromCards += monthly;
      savingsServiceCount += 1;
    }
  }

  const monthlySavings =
    opts?.accountSavings != null && Number(opts.accountSavings) > 0
      ? Number(opts.accountSavings)
      : monthlyFromCards > 0
        ? monthlyFromCards
        : recurring.monthly;

  const monthlyItSpend = active.reduce((sum, s) => sum + parseMoney(s.amountBeforeTax || s.amount), 0);

  const expiredCount = active.filter(
    (s) => s.status === 'expired' || s.exp === 'expired',
  ).length;
  const expiringCount = active.filter(
    (s) =>
      s.status === 'expiring' ||
      s.exp === 'urgent' ||
      s.exp === 'warn' ||
      (Boolean(s.expTxt?.toLowerCase().startsWith('expires')) && s.status !== 'expired'),
  ).length;
  const pendingContractCount = active.filter((s) => s.pendingContract).length;

  const outsideCandidMonthly = external
    .filter((s) => !s.beingReplaced)
    .reduce((sum, s) => sum + parseMoney(s.amountBeforeTax || s.amount), 0);
  const beingReplacedMonthly = external
    .filter((s) => s.beingReplaced)
    .reduce((sum, s) => sum + parseMoney(s.amountBeforeTax || s.amount), 0);

  const savingsRatePct =
    monthlySavings > 0 && monthlyItSpend > 0
      ? Math.round((monthlySavings / monthlyItSpend) * 100)
      : null;

  let nextRenewalLabel: string | null = null;
  let nextRenewalMs = Number.POSITIVE_INFINITY;
  for (const svc of active) {
    const raw = svc.contractEndDate;
    if (!raw) continue;
    const ms = new Date(raw).getTime();
    if (!Number.isFinite(ms) || ms >= nextRenewalMs) continue;
    nextRenewalMs = ms;
    nextRenewalLabel =
      svc.expTxt?.trim() ||
      `Expires ${new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }

  const thisMonth = opts?.techSpendThisMonth ?? null;
  const lastMonth = opts?.techSpendLastMonth ?? null;
  let techSpendMomDelta: number | null = null;
  let techSpendMomPct: number | null = null;
  if (thisMonth != null && lastMonth != null) {
    techSpendMomDelta = thisMonth - lastMonth;
    techSpendMomPct = lastMonth > 0 ? (techSpendMomDelta / lastMonth) * 100 : null;
  }

  return {
    monthlySavings,
    yearlySavings: monthlySavings * 12,
    monthlyItSpend,
    yearlyItSpend: monthlyItSpend * 12,
    techSpendThisMonth: thisMonth,
    techSpendLastMonth: lastMonth,
    techSpendMomDelta,
    techSpendMomPct,
    expiredCount,
    expiringCount,
    pendingContractCount,
    candidManagedCount: candidManaged.length,
    externalCount: external.length,
    savingsServiceCount: savingsServiceCount || recurring.serviceCount,
    savingsRatePct,
    outsideCandidMonthly,
    beingReplacedMonthly,
    nextRenewalLabel,
  };
}

export function formatSnapshotMoney(n: number): string {
  return formatSavingsMoney(n);
}

export function formatMomDelta(delta: number | null, pct: number | null): string | null {
  if (delta == null) return null;
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  const money = `${sign}${formatSavingsMoney(Math.abs(delta))}`;
  if (pct == null || !Number.isFinite(pct)) return money;
  const pctAbs = Math.abs(Math.round(pct));
  return `${money} (${sign}${pctAbs}%)`;
}
