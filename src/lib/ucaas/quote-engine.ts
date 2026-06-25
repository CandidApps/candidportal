import {
  UCAAS_QUOTE_TERM_MONTHS,
  type UcaasCatalog,
  type UcaasCatalogFee,
  type UcaasQuoteLine,
  type UcaasQuoteSnapshot,
  type UcaasQuoteTaxLine,
} from '@/lib/ucaas/types';

export type UcaasFeeAmount = {
  id: string;
  name: string;
  amount: number;
};

export type UcaasQuoteTotals = {
  // One-time setup
  setupItemsSubtotal: number;
  setupSubtotalPreTax: number;
  setupTaxTotal: number;
  setupTotal: number;
  // Recurring monthly
  monthlyItemsSubtotal: number;
  monthlyFees: UcaasFeeAmount[];
  monthlyFeesTotal: number;
  monthlySubtotalPreTax: number;
  monthlyTax: number;
  monthlyTotal: number;
  // Savings
  currentMonthlySpend: number;
  monthlySavings: number;
  annualSavings: number;
};

function lineSubtotal(line: Pick<UcaasQuoteLine, 'quantity' | 'unitPrice' | 'flat'>): number {
  if (line.flat) return round2(line.unitPrice);
  return round2(line.quantity * line.unitPrice);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Sum the quantities of the catalog items that drive a computed fee. */
function feeDriverQuantity(fee: UcaasCatalogFee, lines: UcaasQuoteLine[]): number {
  const driverSet = new Set(fee.driverItemIds);
  return lines.reduce((sum, l) => (driverSet.has(l.itemId) ? sum + (l.quantity || 0) : sum), 0);
}

export function computeUcaasFees(
  fees: UcaasCatalogFee[],
  lines: UcaasQuoteLine[],
): UcaasFeeAmount[] {
  return fees.map((fee) => ({
    id: fee.id,
    name: fee.name,
    amount: round2(feeDriverQuantity(fee, lines) * fee.perUnit),
  }));
}

export function computeUcaasQuote(input: {
  lines: UcaasQuoteLine[];
  fees: UcaasCatalogFee[];
  setupTaxes: UcaasQuoteTaxLine[];
  monthlyTaxRatePct: number;
  currentMonthlySpend: number;
}): UcaasQuoteTotals {
  const setupLines = input.lines.filter((l) => l.section === 'setup');
  const monthlyLines = input.lines.filter((l) => l.section === 'monthly');

  const setupItemsSubtotal = round2(setupLines.reduce((s, l) => s + lineSubtotal(l), 0));
  const setupSubtotalPreTax = setupItemsSubtotal;
  const setupTaxTotal = round2(input.setupTaxes.reduce((s, t) => s + (t.amount || 0), 0));
  const setupTotal = round2(setupSubtotalPreTax + setupTaxTotal);

  const monthlyItemsSubtotal = round2(monthlyLines.reduce((s, l) => s + lineSubtotal(l), 0));

  // Fees apply on the recurring side (matches the spreadsheet's recovery + emergency fees).
  const monthlyFeeRules = input.fees.filter((f) => f.section !== 'setup');
  const monthlyFees = computeUcaasFees(monthlyFeeRules, monthlyLines);
  const monthlyFeesTotal = round2(monthlyFees.reduce((s, f) => s + f.amount, 0));

  const monthlySubtotalPreTax = round2(monthlyItemsSubtotal + monthlyFeesTotal);
  const monthlyTax = round2(monthlySubtotalPreTax * (input.monthlyTaxRatePct / 100));
  const monthlyTotal = round2(monthlySubtotalPreTax + monthlyTax);

  const currentMonthlySpend = round2(input.currentMonthlySpend || 0);
  const monthlySavings = round2(currentMonthlySpend - monthlyTotal);
  const annualSavings = round2(monthlySavings * UCAAS_QUOTE_TERM_MONTHS);

  return {
    setupItemsSubtotal,
    setupSubtotalPreTax,
    setupTaxTotal,
    setupTotal,
    monthlyItemsSubtotal,
    monthlyFees,
    monthlyFeesTotal,
    monthlySubtotalPreTax,
    monthlyTax,
    monthlyTotal,
    currentMonthlySpend,
    monthlySavings,
    annualSavings,
  };
}

export function computeUcaasQuoteFromSnapshot(snap: UcaasQuoteSnapshot): UcaasQuoteTotals {
  return computeUcaasQuote({
    lines: snap.lines,
    fees: snap.fees,
    setupTaxes: snap.setupTaxes,
    monthlyTaxRatePct: snap.monthlyTaxRatePct,
    currentMonthlySpend: snap.currentMonthlySpend,
  });
}

/** Build a fresh set of quote lines from a catalog's default quantities/prices. */
export function buildQuoteLinesFromCatalog(catalog: UcaasCatalog): UcaasQuoteLine[] {
  return catalog.items.map((item) => ({
    itemId: item.id,
    section: item.section,
    name: item.name,
    quantity: item.defaultQuantity,
    unitPrice: item.unitPrice,
    flat: item.flat,
  }));
}

/** Create a starter quote snapshot from a catalog. */
export function buildQuoteSnapshotFromCatalog(args: {
  catalogId?: string;
  catalogName?: string;
  providerName: string;
  catalog: UcaasCatalog;
  currentMonthlySpend?: number;
}): UcaasQuoteSnapshot {
  return {
    catalogId: args.catalogId,
    catalogName: args.catalogName,
    providerName: args.providerName,
    lines: buildQuoteLinesFromCatalog(args.catalog),
    fees: args.catalog.fees,
    setupTaxes: args.catalog.tax.setupTaxLabels.map((label) => ({ label, amount: 0 })),
    monthlyTaxRatePct: args.catalog.tax.monthlyTaxRatePct,
    currentMonthlySpend: args.currentMonthlySpend ?? 0,
  };
}
