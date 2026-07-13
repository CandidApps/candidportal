import type { QuoteCustomerAcceptance } from '@/lib/quotes/quote-acceptance';
import type { PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';
import {
  computeUcaasQuote,
  type UcaasQuoteTotals,
} from '@/lib/ucaas/quote-engine';
import type { UcaasQuoteLine, UcaasQuoteSnapshot } from '@/lib/ucaas/types';
import { seatQuantityFromQuote } from '@/lib/services/service-savings';

export type QuotePackageLineView = {
  name: string;
  section: 'setup' | 'monthly';
  quantity: number;
  unitPrice: number;
  subtotal: number;
  flat?: boolean;
};

export type QuotePackageFeeView = {
  name: string;
  amount: number;
};

export type QuotePackageSummary = {
  providerName: string | null;
  seatCount: number | null;
  lines: QuotePackageLineView[];
  fees: QuotePackageFeeView[];
  setupTotal: number | null;
  monthlyItemsSubtotal: number | null;
  monthlyFeesTotal: number | null;
  monthlyTax: number | null;
  monthlyTaxRatePct: number | null;
  monthlyTotal: number | null;
  currentMonthlySpend: number | null;
  monthlySavings: number | null;
  annualSavings: number | null;
  source: 'acceptance' | 'snapshot' | 'merged';
};

function lineSubtotal(l: Pick<UcaasQuoteLine, 'quantity' | 'unitPrice' | 'flat'>): number {
  if (l.flat) return Number(l.unitPrice) || 0;
  return (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
}

function includedLines(lines: UcaasQuoteLine[]): UcaasQuoteLine[] {
  return lines.filter((l) => {
    const sub = lineSubtotal(l);
    if (l.section === 'setup') return sub !== 0 || (l.quantity > 0 && l.unitPrice === 0);
    return l.quantity > 0 || sub !== 0;
  });
}

function toLineViews(lines: UcaasQuoteLine[]): QuotePackageLineView[] {
  return includedLines(lines).map((l) => ({
    name: l.name || 'Line',
    section: l.section,
    quantity: l.quantity ?? 0,
    unitPrice: l.unitPrice ?? 0,
    subtotal: Math.round((lineSubtotal(l) + Number.EPSILON) * 100) / 100,
    flat: l.flat,
  }));
}

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

/** Resolve the richest quote package we can from acceptance + published analysis. */
export function resolveQuotePackage(input: {
  acceptance?: QuoteCustomerAcceptance | null;
  snapshot?: PublishedAnalysisSnapshot | null;
  vendorName?: string | null;
  serviceLabel?: string | null;
}): QuotePackageSummary | null {
  const snapQuote = input.snapshot?.ucaasQuote ?? null;
  const acceptanceLines = input.acceptance?.lines?.length ? input.acceptance.lines : null;
  const lines = acceptanceLines ?? snapQuote?.lines ?? null;
  if (!lines?.length && input.acceptance?.monthlyTotal == null && !snapQuote) {
    return null;
  }

  let totals: UcaasQuoteTotals | null = null;
  if (snapQuote && lines) {
    totals = computeUcaasQuote({
      lines,
      fees: snapQuote.fees ?? [],
      setupTaxes: snapQuote.setupTaxes ?? [],
      monthlyTaxRatePct: snapQuote.monthlyTaxRatePct ?? 0,
      currentMonthlySpend: snapQuote.currentMonthlySpend ?? 0,
    });
  }

  const seatCount = snapQuote
    ? seatQuantityFromQuote({ ...snapQuote, lines: lines ?? snapQuote.lines })
    : lines
      ? seatQuantityFromQuote({
          providerName: input.vendorName || 'Provider',
          lines,
          fees: [],
          setupTaxes: [],
          monthlyTaxRatePct: 0,
          currentMonthlySpend: 0,
        })
      : null;

  const fees: QuotePackageFeeView[] =
    totals?.monthlyFees
      .filter((f) => f.amount !== 0)
      .map((f) => ({ name: f.name, amount: f.amount })) ?? [];

  return {
    providerName:
      snapQuote?.providerName ||
      input.vendorName ||
      input.serviceLabel ||
      input.acceptance?.serviceLabel ||
      null,
    seatCount: seatCount && seatCount > 0 ? seatCount : null,
    lines: lines ? toLineViews(lines) : [],
    fees,
    setupTotal: totals?.setupTotal ?? input.acceptance?.setupTotal ?? null,
    monthlyItemsSubtotal: totals?.monthlyItemsSubtotal ?? null,
    monthlyFeesTotal: totals?.monthlyFeesTotal ?? null,
    monthlyTax: totals?.monthlyTax ?? null,
    monthlyTaxRatePct: snapQuote?.monthlyTaxRatePct ?? null,
    monthlyTotal: totals?.monthlyTotal ?? input.acceptance?.monthlyTotal ?? null,
    currentMonthlySpend: totals?.currentMonthlySpend ?? snapQuote?.currentMonthlySpend ?? null,
    monthlySavings: totals
      ? Math.max(0, totals.monthlySavings)
      : input.acceptance?.monthlySavings ?? null,
    annualSavings: totals
      ? Math.max(0, totals.annualSavings)
      : input.acceptance?.annualSavings ?? null,
    source: acceptanceLines && snapQuote ? 'merged' : acceptanceLines ? 'acceptance' : 'snapshot',
  };
}

export function formatQuotePackageForEmail(pkg: QuotePackageSummary): string[] {
  const out: string[] = [];

  if (pkg.providerName) out.push(`Provider / solution: ${pkg.providerName}`);
  if (pkg.seatCount != null) out.push(`Seats / extensions: ${pkg.seatCount}`);

  const setup = pkg.lines.filter((l) => l.section === 'setup');
  const monthly = pkg.lines.filter((l) => l.section === 'monthly');

  if (setup.length) {
    out.push('', 'One-time / setup:');
    for (const line of setup) {
      const qty = line.flat ? '' : `${line.quantity} × `;
      out.push(
        `  • ${qty}${line.name} @ $${line.unitPrice.toFixed(2)} = ${money(line.subtotal)}`,
      );
    }
    if (pkg.setupTotal != null) out.push(`  Setup total: ${money(pkg.setupTotal)}`);
  }

  if (monthly.length) {
    out.push('', 'Monthly package:');
    for (const line of monthly) {
      const qty = line.flat ? '' : `${line.quantity} × `;
      out.push(
        `  • ${qty}${line.name} @ $${line.unitPrice.toFixed(2)} = ${money(line.subtotal)}`,
      );
    }
  }

  if (pkg.fees.length) {
    out.push('', 'Monthly fees:');
    for (const fee of pkg.fees) {
      out.push(`  • ${fee.name}: ${money(fee.amount)}`);
    }
  }

  if (pkg.monthlyItemsSubtotal != null) {
    out.push(`Monthly items subtotal: ${money(pkg.monthlyItemsSubtotal)}`);
  }
  if (pkg.monthlyFeesTotal != null && pkg.monthlyFeesTotal !== 0) {
    out.push(`Monthly fees total: ${money(pkg.monthlyFeesTotal)}`);
  }
  if (pkg.monthlyTax != null) {
    const rate =
      pkg.monthlyTaxRatePct != null ? ` (~${pkg.monthlyTaxRatePct.toFixed(1)}%)` : '';
    out.push(`Est. monthly tax${rate}: ${money(pkg.monthlyTax)}`);
  }
  if (pkg.monthlyTotal != null) {
    out.push(`Selected monthly total: ${money(pkg.monthlyTotal)}`);
  }
  if (pkg.currentMonthlySpend != null && pkg.currentMonthlySpend > 0) {
    out.push(`Current monthly spend: ${money(pkg.currentMonthlySpend)}`);
  }
  if (pkg.monthlySavings != null && pkg.monthlySavings > 0) {
    out.push(`Est. monthly savings: ${money(pkg.monthlySavings)}`);
  }
  if (pkg.annualSavings != null && pkg.annualSavings > 0) {
    out.push(`Est. annual savings: ${money(pkg.annualSavings)}`);
  }

  return out;
}

export function snapshotFromPublished(raw: unknown): PublishedAnalysisSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as PublishedAnalysisSnapshot;
}

/** Prefer acceptance lines; fill fees/tax context from published UCaaS quote. */
export function mergeAcceptanceWithSnapshot(
  acceptance: QuoteCustomerAcceptance | null | undefined,
  snapshot: PublishedAnalysisSnapshot | null | undefined,
): UcaasQuoteSnapshot | null {
  const snapQuote = snapshot?.ucaasQuote;
  if (!snapQuote && !acceptance?.lines?.length) return null;
  if (!snapQuote) {
    return {
      providerName: acceptance?.serviceLabel || 'Provider',
      lines: acceptance!.lines!,
      fees: [],
      setupTaxes: [],
      monthlyTaxRatePct: 0,
      currentMonthlySpend: 0,
    };
  }
  return {
    ...snapQuote,
    lines: acceptance?.lines?.length ? acceptance.lines : snapQuote.lines,
  };
}
