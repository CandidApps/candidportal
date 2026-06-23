import type { ScheduleARateLine } from '@/lib/schedule-a-types';
import type { MerchantStatementForm } from '@/lib/candid-pay/merchant-analysis';
import { fmt$ } from '@/lib/candid-pay/pricingEngine';
import type { StatementData } from '@/lib/candid-pay/statementParser';
import { sortStatements } from '@/lib/candid-pay/statementParser';
import type { MerchantAnalysisProvider, ProviderSavingsQuote } from '@/lib/analysis/types';
import { isInterchangePlusStructure } from '@/lib/analysis/statement-pricing-model';

type ParsedRate =
  | { kind: 'percent'; value: number }
  | { kind: 'bps'; value: number }
  | { kind: 'per_item'; value: number }
  | { kind: 'monthly'; value: number }
  | { kind: 'annual'; value: number };

function parseSellRate(raw: string): ParsedRate | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;

  const pct = s.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct) return { kind: 'percent', value: parseFloat(pct[1]) };

  const bps = s.match(/(\d+(?:\.\d+)?)\s*bps/);
  if (bps) return { kind: 'bps', value: parseFloat(bps[1]) };

  if (s.includes('/mo') || s.includes('monthly')) {
    const m = s.match(/\$?\s*(\d+(?:\.\d+)?)/);
    if (m) return { kind: 'monthly', value: parseFloat(m[1]) };
  }

  if (s.includes('/yr') || s.includes('annual')) {
    const m = s.match(/\$?\s*(\d+(?:\.\d+)?)/);
    if (m) return { kind: 'annual', value: parseFloat(m[1]) };
  }

  const dollar = s.match(/\$?\s*(\d+(?:\.\d+)?)/);
  if (dollar) {
    const value = parseFloat(dollar[1]);
    if (value > 0 && value < 1 && !s.includes('$')) {
      return { kind: 'per_item', value };
    }
    if (value >= 1 && value <= 15 && !s.includes('bps')) {
      return { kind: 'per_item', value };
    }
    if (value < 1) return { kind: 'per_item', value };
    return { kind: 'monthly', value };
  }

  const plain = parseFloat(s);
  if (!Number.isNaN(plain)) {
    if (plain > 0 && plain <= 10) return { kind: 'percent', value: plain };
    if (plain > 0 && plain < 1) return { kind: 'per_item', value: plain };
  }

  return null;
}

export type SellMarkupFromSchedule = {
  markupBps: number | null;
  lineItem?: string;
  lineSection?: string;
  buyRateLabel?: string;
};

export type CardMarkupLine = {
  lineId: string;
  label: string;
  markupBps: number;
  buyRateLabel: string;
  family: 'vmcd' | 'amex' | 'general';
};

export type InterchangePlusScheduleDetails = {
  cardMarkups: CardMarkupLine[];
  blendedMarkupBps: number | null;
  transactionFees: { label: string; perItem: number; lineId: string }[];
  transactionFeePerItem: number | null;
  monthlyFees: number;
  sellMarkupMissing: boolean;
};

function classifyCardFamily(line: ScheduleARateLine): 'vmcd' | 'amex' | 'general' | null {
  const hay = `${line.section} ${line.item} ${line.notes ?? ''}`.toLowerCase();
  if (hay.includes('amex') || hay.includes('american express')) return 'amex';
  if (
    hay.includes('v/mc') ||
    hay.includes('v/mcd') ||
    hay.includes('vmc') ||
    hay.includes('visa') ||
    hay.includes('mastercard') ||
    hay.includes('master card') ||
    hay.includes('discover') ||
    hay.includes('diners') ||
    /\bmc\b/.test(hay) ||
    hay.includes('debit/credit') ||
    hay.includes('credit/debit')
  ) {
    return 'vmcd';
  }
  if (
    hay.includes('interchange') ||
    hay.includes('markup') ||
    hay.includes('plus') ||
    hay.includes('discount') ||
    hay.includes('card processing')
  ) {
    return 'general';
  }
  return null;
}

function markupBpsFromLine(line: ScheduleARateLine): number | null {
  const parsed = parseSellRate(line.buyRate);
  if (!parsed) return null;

  const item = `${line.section} ${line.item}`.toLowerCase();
  if (parsed.kind === 'bps') return parsed.value;
  if (
    parsed.kind === 'percent' &&
    (item.includes('markup') ||
      item.includes('discount') ||
      item.includes('interchange') ||
      item.includes('plus'))
  ) {
    return Math.round(parsed.value * 100);
  }
  return null;
}

function isTransactionFeeLine(line: ScheduleARateLine): boolean {
  if (line.section === 'Reseller Compensation Tier') return false;
  const item = `${line.section} ${line.item}`.toLowerCase();
  if (line.section === 'Per-Item Fees') return true;
  return (
    item.includes('transaction') ||
    item.includes('per item') ||
    item.includes('per tran') ||
    item.includes('authorization') ||
    item.includes('auth fee') ||
    item.includes('batch')
  );
}

function cardMarkupLabel(line: ScheduleARateLine, family: CardMarkupLine['family']): string {
  const item = line.item.trim();
  if (item) return item;
  if (family === 'amex') return 'Amex';
  if (family === 'vmcd') return 'V/MC/D';
  return 'Card processing';
}

/** All interchange-plus markup and per-item fees from partner Our rate schedule lines. */
export function extractInterchangePlusScheduleDetails(
  lines: ScheduleARateLine[],
): InterchangePlusScheduleDetails {
  const cardMarkups: CardMarkupLine[] = [];
  const transactionFees: { label: string; perItem: number; lineId: string }[] = [];
  let monthlyFees = 0;

  for (const line of lines) {
    if (line.section === 'Reseller Compensation Tier') continue;

    const family = classifyCardFamily(line);
    const markupBps = family != null ? markupBpsFromLine(line) : null;
    if (markupBps != null && family) {
      cardMarkups.push({
        lineId: line.id,
        label: cardMarkupLabel(line, family),
        markupBps,
        buyRateLabel: line.buyRate,
        family,
      });
      continue;
    }

    const parsed = parseSellRate(line.buyRate);
    if (!parsed) continue;

    if (parsed.kind === 'per_item' && isTransactionFeeLine(line)) {
      transactionFees.push({
        label: line.item.trim() || 'Transaction fee',
        perItem: parsed.value,
        lineId: line.id,
      });
      continue;
    }

    if (parsed.kind === 'monthly') {
      monthlyFees += parsed.value;
    } else if (parsed.kind === 'annual') {
      monthlyFees += parsed.value / 12;
    }
  }

  const uniqueMarkups = cardMarkups;

  const transactionFeePerItem =
    transactionFees.length > 0
      ? transactionFees.reduce((sum, fee) => sum + fee.perItem, 0)
      : null;

  return {
    cardMarkups: uniqueMarkups,
    blendedMarkupBps: null,
    transactionFees,
    transactionFeePerItem,
    monthlyFees,
    sellMarkupMissing: uniqueMarkups.length === 0,
  };
}

function volumeSplit(stmt?: StatementData): { vmcd: number; amex: number; total: number } {
  const bd = stmt?.cardBreakdown;
  const vmcd = (bd?.visa ?? 0) + (bd?.mastercard ?? 0) + (bd?.discover ?? 0);
  const amex = bd?.amex ?? 0;
  const total = vmcd + amex;
  return { vmcd, amex, total };
}

function resolveMarkupBpsForFamily(
  markups: CardMarkupLine[],
  family: 'vmcd' | 'amex',
): number | null {
  const direct = markups.find((m) => m.family === family);
  if (direct) return direct.markupBps;
  const general = markups.find((m) => m.family === 'general');
  return general?.markupBps ?? null;
}

function blendedMarkupBps(
  markups: CardMarkupLine[],
  vol: number,
  stmt?: StatementData,
): number | null {
  if (!markups.length) return null;

  const { vmcd, amex, total } = volumeSplit(stmt);
  const vmcdBps = resolveMarkupBpsForFamily(markups, 'vmcd');
  const amexBps = resolveMarkupBpsForFamily(markups, 'amex');

  if (total > 0 && (vmcdBps != null || amexBps != null)) {
    const vmcdRate = vmcdBps ?? amexBps ?? 0;
    const amexRate = amexBps ?? vmcdBps ?? 0;
    return Math.round(((vmcd * vmcdRate + amex * amexRate) / total) * 100) / 100;
  }

  if (vmcdBps != null && amexBps != null) {
    return Math.round(((vmcdBps + amexBps) / 2) * 100) / 100;
  }

  return vmcdBps ?? amexBps ?? markups[0]?.markupBps ?? null;
}

function markupMonthlyFromSchedule(
  markups: CardMarkupLine[],
  vol: number,
  stmt?: StatementData,
): number {
  if (!markups.length || vol <= 0) return 0;

  const { vmcd, amex, total } = volumeSplit(stmt);
  const vmcdBps = resolveMarkupBpsForFamily(markups, 'vmcd');
  const amexBps = resolveMarkupBpsForFamily(markups, 'amex');

  if (total > 0 && (vmcdBps != null || amexBps != null)) {
    const vmcdRate = vmcdBps ?? amexBps ?? 0;
    const amexRate = amexBps ?? vmcdBps ?? 0;
    return vmcd * (vmcdRate / 10000) + amex * (amexRate / 10000);
  }

  const blended = blendedMarkupBps(markups, vol, stmt) ?? 0;
  return vol * (blended / 10000);
}

/** Interchange-plus sell markup (bps) from partner Our rate schedule lines. */
export function extractSellMarkupBps(lines: ScheduleARateLine[]): SellMarkupFromSchedule {
  const details = extractInterchangePlusScheduleDetails(lines);
  const blended = blendedMarkupBps(details.cardMarkups, 1);
  const primary =
    details.cardMarkups.find((m) => m.family === 'vmcd') ??
    details.cardMarkups.find((m) => m.family === 'general') ??
    details.cardMarkups[0];

  return {
    markupBps: blended,
    lineItem: primary?.label,
    lineSection: primary ? 'Card Processing' : undefined,
    buyRateLabel: primary?.buyRateLabel,
  };
}

export type InterchangePlusScheduleQuote = {
  currentMarkupBps: number;
  proposedMarkupBps: number | null;
  proposedMarkupSource?: string;
  proposedCardMarkups: CardMarkupLine[];
  proposedPerItemFees: { label: string; perItem: number; monthlyEstimate: number }[];
  proposedTransactionFeePerItem: number | null;
  proposedTransactionFeeMonthly: number;
  currentMonthlyCost: number;
  proposedMonthlyCost: number;
  monthlySavings: number;
  annualSavings: number;
  proposedRateLabel: string;
  sellMarkupMissing: boolean;
  /** Markup revenue used for commission estimates */
  commissionRevenueBasis?: number;
};

function passThroughExcludingMarkup(stmt?: StatementData): number {
  if (!stmt?.feeBreakdown) return 0;
  const fb = stmt.feeBreakdown;
  return (
    fb.interchange +
    fb.networkFees +
    fb.nonQualSurcharge +
    fb.authFees +
    fb.bascStand +
    fb.stmtMail +
    fb.acctFee +
    fb.otherFixed
  );
}

/** Resolve processing markup (bps) from form, statement fees, or effective rate. */
export function resolveCurrentMarkupBps(
  form: MerchantStatementForm,
  stmt?: StatementData,
): number {
  if (!isInterchangePlusStructure(form.pricingModel, stmt)) {
    return 0;
  }

  const vol = parseFloat(form.ccVolume) || stmt?.totalVolume || 0;
  const fromForm = parseFloat(form.currentMarkupBps) || 0;
  const fromStmt = stmt?.processingMarkupBps || 0;
  if (fromForm > 0) return Math.round(fromForm);
  if (fromStmt > 0) return Math.round(fromStmt);

  const fb = stmt?.feeBreakdown;
  if (vol > 0 && fb && fb.processingMarkup > 0) {
    return Math.round((fb.processingMarkup / vol) * 10000);
  }

  if (vol > 0 && stmt) {
    const passThrough = passThroughExcludingMarkup(stmt);
    const total =
      stmt.totalFees > 0
        ? stmt.totalFees
        : parseFloat(form.currentEffectiveRate) > 0
          ? vol * (parseFloat(form.currentEffectiveRate) / 100)
          : 0;
    if (total > passThrough && passThrough > 0) {
      return Math.round(((total - passThrough) / vol) * 10000);
    }
  }

  const effectiveRate = parseFloat(form.currentEffectiveRate) || stmt?.effectiveRate || 0;
  // Typical interchange + network pass-through ~2.1% when fee breakdown is missing
  if (effectiveRate > 2.1) {
    return Math.round((effectiveRate - 2.1) * 100);
  }

  return 0;
}

/** Interchange Plus proposal from parsed statement vs partner sell schedule. */
export function calcInterchangePlusFromSchedule(
  form: MerchantStatementForm,
  providerLines: ScheduleARateLine[],
  statements?: StatementData[],
): InterchangePlusScheduleQuote {
  const sorted = statements?.length ? sortStatements(statements) : [];
  const stmt = sorted[sorted.length - 1];
  const vol = parseFloat(form.ccVolume) || stmt?.totalVolume || 0;
  const txn =
    parseFloat(form.transactionCount) || stmt?.transactionCount || Math.max(1, Math.round(vol / 75));
  const effectiveRate = parseFloat(form.currentEffectiveRate) || stmt?.effectiveRate || 0;
  const currentBps = resolveCurrentMarkupBps(form, stmt);
  const schedule = extractInterchangePlusScheduleDetails(providerLines);
  const sellBps = blendedMarkupBps(schedule.cardMarkups, vol, stmt);

  const currentMarkupMonthly =
    stmt?.feeBreakdown?.processingMarkup && stmt.feeBreakdown.processingMarkup > 0
      ? stmt.feeBreakdown.processingMarkup
      : vol * (currentBps / 10000);

  let currentMonthlyCost: number;
  if (stmt?.totalFees && stmt.totalFees > 0) {
    currentMonthlyCost = stmt.totalFees;
  } else if (effectiveRate > 0 && vol > 0) {
    currentMonthlyCost = vol * (effectiveRate / 100);
  } else {
    currentMonthlyCost = passThroughExcludingMarkup(stmt) + currentMarkupMonthly;
  }

  const passThrough = passThroughExcludingMarkup(stmt);
  const currentAuthFees = stmt?.feeBreakdown?.authFees ?? 0;
  const proposedMarkupMonthly = markupMonthlyFromSchedule(schedule.cardMarkups, vol, stmt);
  const proposedTransactionFeeMonthly =
    schedule.transactionFeePerItem != null ? schedule.transactionFeePerItem * txn : 0;
  const proposedPerItemFees = schedule.transactionFees.map((fee) => ({
    label: fee.label,
    perItem: fee.perItem,
    monthlyEstimate: fee.perItem * txn,
  }));

  let proposedMonthlyCost: number;
  let monthlySavings: number;

  const passThroughAdjusted =
    passThrough > 0
      ? passThrough - currentAuthFees + proposedTransactionFeeMonthly
      : 0;

  if (passThrough > 0) {
    proposedMonthlyCost = passThroughAdjusted + proposedMarkupMonthly;
    monthlySavings = currentMonthlyCost - proposedMonthlyCost;
  } else if (currentMarkupMonthly > 0 && sellBps != null) {
    proposedMonthlyCost =
      currentMonthlyCost -
      currentMarkupMonthly +
      proposedMarkupMonthly +
      (proposedTransactionFeeMonthly - currentAuthFees);
    monthlySavings = currentMonthlyCost - proposedMonthlyCost;
  } else if (effectiveRate > 0 && vol > 0 && sellBps != null && currentBps > 0) {
    monthlySavings =
      vol * ((currentBps - sellBps) / 10000) + (currentAuthFees - proposedTransactionFeeMonthly);
    proposedMonthlyCost = currentMonthlyCost - monthlySavings;
  } else {
    proposedMonthlyCost = currentMonthlyCost;
    monthlySavings = 0;
  }

  const sourceParts = schedule.cardMarkups.map(
    (m) => `${m.label} (${m.buyRateLabel})`,
  );
  const sourceLabel = sourceParts.length ? sourceParts.join(' · ') : undefined;

  let proposedRateLabel: string;
  if (sellBps != null && schedule.cardMarkups.length) {
    const markupParts = schedule.cardMarkups.map(
      (m) => `${m.label}: Interchange + ${m.markupBps} bps`,
    );
    proposedRateLabel = markupParts.join(' · ');
    if (schedule.transactionFeePerItem != null) {
      proposedRateLabel += ` · ${fmt$(schedule.transactionFeePerItem)} per transaction`;
    }
    if (effectiveRate > 0) {
      const estAllIn =
        passThrough > 0 && vol > 0
          ? (proposedMonthlyCost / vol) * 100
          : effectiveRate - (currentBps - sellBps) / 100;
      proposedRateLabel += ` (~${estAllIn.toFixed(2)}% all-in vs ${effectiveRate.toFixed(2)}% today)`;
    }
  } else {
    proposedRateLabel = 'No interchange markup on Our rate schedule';
  }

  return {
    currentMarkupBps: currentBps,
    proposedMarkupBps: sellBps,
    proposedMarkupSource: sourceLabel,
    proposedCardMarkups: schedule.cardMarkups,
    proposedPerItemFees,
    proposedTransactionFeePerItem: schedule.transactionFeePerItem,
    proposedTransactionFeeMonthly,
    currentMonthlyCost,
    proposedMonthlyCost,
    monthlySavings,
    annualSavings: monthlySavings * 12,
    proposedRateLabel,
    sellMarkupMissing: schedule.sellMarkupMissing,
    commissionRevenueBasis: proposedMarkupMonthly,
  };
}

function currentCosts(form: MerchantStatementForm, statements: StatementData[]) {
  const vol = parseFloat(form.ccVolume) || 0;
  const rate = parseFloat(form.currentEffectiveRate) || 0;
  const txn = parseFloat(form.transactionCount) || Math.round(vol / 75);

  const sorted = sortStatements(statements);
  const months = sorted.length || 1;
  const sumFees = (fn: (s: StatementData) => number) => sorted.reduce((acc, s) => acc + fn(s), 0);

  const volumeCost = vol * (rate / 100);
  const fixedFromStatement =
    sumFees(
      (s) =>
        (s.feeBreakdown?.bascStand ?? 0) +
        (s.feeBreakdown?.stmtMail ?? 0) +
        (s.feeBreakdown?.acctFee ?? 0) +
        (s.feeBreakdown?.otherFixed ?? 0),
    ) / months;

  const fixedFromForm =
    (parseFloat(form.bascStand) || 0) +
    (parseFloat(form.stmtMail) || 0) +
    (parseFloat(form.nonQualFee) || 0);

  const fixedMonthly = fixedFromStatement > 0 ? fixedFromStatement : fixedFromForm;

  return { vol, rate, txn, volumeCost, fixedMonthly, totalMonthly: volumeCost + fixedMonthly };
}

function quoteFromProvider(
  provider: MerchantAnalysisProvider,
  form: MerchantStatementForm,
  statements: StatementData[],
): ProviderSavingsQuote | null {
  if (!provider.lines.length) return null;

  const current = currentCosts(form, statements);
  const notes: string[] = [];
  let flatRatePct: number | undefined;
  let markupBps: number | undefined;
  let perItemTotal = 0;
  let monthlyFees = 0;
  let matchedLines = 0;

  const sellMarkup = extractSellMarkupBps(provider.lines);
  markupBps = sellMarkup.markupBps ?? undefined;
  const icPlusDetails = extractInterchangePlusScheduleDetails(provider.lines);

  for (const line of provider.lines) {
    const parsed = parseSellRate(line.buyRate);
    if (!parsed) continue;
    matchedLines += 1;

    const item = `${line.section} · ${line.item}`.toLowerCase();

    if (parsed.kind === 'percent') {
      if (!flatRatePct || item.includes('flat') || item.includes('blended') || item.includes('discount')) {
        flatRatePct = parsed.value;
      }
    } else if (parsed.kind === 'bps') {
      // markupBps already from extractSellMarkupBps
      continue;
    } else if (parsed.kind === 'per_item') {
      if (
        item.includes('transaction') ||
        item.includes('authorization') ||
        item.includes('auth') ||
        item.includes('per item') ||
        item.includes('batch') ||
        line.section === 'Per-Item Fees'
      ) {
        perItemTotal += parsed.value;
      }
    } else if (parsed.kind === 'monthly') {
      monthlyFees += parsed.value;
    } else if (parsed.kind === 'annual') {
      monthlyFees += parsed.value / 12;
    }
  }

  let volumeCost = 0;
  if (flatRatePct != null) {
    volumeCost = current.vol * (flatRatePct / 100);
    notes.push(`Proposed flat card rate ${flatRatePct.toFixed(2)}% from ${provider.name} sell schedule.`);
  } else if (markupBps != null) {
    volumeCost = markupMonthlyFromSchedule(icPlusDetails.cardMarkups, current.vol, statements[statements.length - 1]);
    const markupNotes = icPlusDetails.cardMarkups.map(
      (m) => `${m.label}: ${m.markupBps} bps`,
    );
    notes.push(
      markupNotes.length > 1
        ? `Proposed markup by card brand — ${markupNotes.join('; ')} (interchange pass-through).`
        : `Proposed markup ${markupBps} bps above interchange (interchange assumed pass-through at current levels).`,
    );
  } else if (current.rate > 0) {
    const improvementBps = 15;
    const proposedRate = Math.max(current.rate - improvementBps / 100, 1.5);
    volumeCost = current.vol * (proposedRate / 100);
    notes.push(`No flat rate on file — estimated ${proposedRate.toFixed(2)}% from fee schedule comparison.`);
  }

  const perItemFromSchedule =
    icPlusDetails.transactionFeePerItem != null
      ? icPlusDetails.transactionFeePerItem
      : perItemTotal;
  const perItemCost = current.txn * perItemFromSchedule;
  const proposedMonthlyCost = volumeCost + perItemCost + monthlyFees;
  const monthlySavings = Math.max(0, current.totalMonthly - proposedMonthlyCost);

  if (matchedLines === 0) return null;

  return {
    providerId: provider.id,
    providerName: provider.displayName ?? provider.name,
    currentMonthlyCost: current.totalMonthly,
    proposedMonthlyCost,
    monthlySavings,
    annualSavings: monthlySavings * 12,
    breakdown: {
      volumeCost,
      perItemCost,
      monthlyFees,
      flatRatePct,
      markupBps,
    },
    matchedLines,
    notes,
  };
}

export function calcProviderSavingsQuotes(
  providers: MerchantAnalysisProvider[],
  form: MerchantStatementForm,
  statements: StatementData[],
): ProviderSavingsQuote[] {
  return providers
    .map((p) => quoteFromProvider(p, form, statements))
    .filter((q): q is ProviderSavingsQuote => q != null && q.monthlySavings > 0)
    .sort((a, b) => b.monthlySavings - a.monthlySavings);
}

/** All providers with a quotable schedule (includes zero or negative savings). */
export function calcAllProviderQuotes(
  providers: MerchantAnalysisProvider[],
  form: MerchantStatementForm,
  statements: StatementData[],
): ProviderSavingsQuote[] {
  return providers
    .map((p) => quoteFromProvider(p, form, statements))
    .filter((q): q is ProviderSavingsQuote => q != null)
    .sort((a, b) => b.monthlySavings - a.monthlySavings);
}

export function bestProviderQuote(quotes: ProviderSavingsQuote[]): ProviderSavingsQuote | null {
  return quotes[0] ?? null;
}
