import type { StatementData } from '@/lib/candid-pay/statementParser';
import { sortStatements } from '@/lib/candid-pay/statementParser';
import { isResellerCompensationSection, normalizeScheduleASection, type ScheduleARateLine } from '@/lib/schedule-a-types';
import type { CurrentFeeLine } from '@/lib/analysis/types';

type FeeDef = {
  section: string;
  item: string;
  key: keyof StatementData['feeBreakdown'] | 'effectiveRate' | 'totalFees';
  keywords: string[];
};

const FEE_DEFS: FeeDef[] = [
  {
    section: 'Card Processing',
    item: 'Interchange',
    key: 'interchange',
    keywords: ['interchange'],
  },
  {
    section: 'Card Processing',
    item: 'Processing markup',
    key: 'processingMarkup',
    keywords: ['markup', 'processing', 'discount'],
  },
  {
    section: 'Card Processing',
    item: 'Network & assessment fees',
    key: 'networkFees',
    keywords: ['network', 'assessment', 'dues', 'brand'],
  },
  {
    section: 'Card Processing',
    item: 'Non-qualified surcharge',
    key: 'nonQualSurcharge',
    keywords: ['non-qual', 'non qual', 'nq', 'surcharge'],
  },
  {
    section: 'Per-Item Fees',
    item: 'Authorization fees',
    key: 'authFees',
    keywords: ['authorization', 'auth', 'per item', 'transaction'],
  },
  {
    section: 'Monthly Fees',
    item: 'BAS / statement fee',
    key: 'bascStand',
    keywords: ['basc', 'statement', 'batch'],
  },
  {
    section: 'Monthly Fees',
    item: 'Statement mailing',
    key: 'stmtMail',
    keywords: ['mail', 'postage', 'paper'],
  },
  {
    section: 'Monthly Fees',
    item: 'Account / PCI fee',
    key: 'acctFee',
    keywords: ['account', 'pci', 'maintenance', 'compliance'],
  },
  {
    section: 'Monthly Fees',
    item: 'Other monthly fees',
    key: 'otherFixed',
    keywords: ['other', 'misc', 'monthly', 'regulatory'],
  },
];

function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokensOverlap(a: string, b: string): boolean {
  const na = normalizeToken(a);
  const nb = normalizeToken(b);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  const aWords = na.split(/\s+/).filter((w) => w.length > 2);
  const bWords = nb.split(/\s+/).filter((w) => w.length > 2);
  return aWords.some((w) => bWords.some((bw) => bw.includes(w) || w.includes(bw)));
}

export function matchRateLineForFee(
  feeItem: string,
  feeKeywords: string[],
  rateLines: ScheduleARateLine[],
): ScheduleARateLine | undefined {
  for (const line of rateLines) {
    if (isResellerCompensationSection(line.section)) continue;
    const haystack = `${line.section} ${line.item} ${line.notes ?? ''}`;
    if (tokensOverlap(feeItem, line.item)) return line;
    if (feeKeywords.some((kw) => tokensOverlap(kw, haystack))) return line;
  }
  return undefined;
}

export function buildCurrentFeeLines(
  statements: StatementData[],
  ourRateLines: ScheduleARateLine[] = [],
): CurrentFeeLine[] {
  const sorted = sortStatements(statements);
  if (!sorted.length) return [];

  const months = sorted.length || 1;
  const avg = (fn: (s: StatementData) => number) =>
    sorted.reduce((acc, s) => acc + fn(s), 0) / months;

  const rows: CurrentFeeLine[] = [];

  for (const def of FEE_DEFS) {
    const amount = avg((s) => s.feeBreakdown?.[def.key as keyof typeof s.feeBreakdown] ?? 0);
    if (amount <= 0) continue;
    const match = matchRateLineForFee(def.item, def.keywords, ourRateLines);
    rows.push({
      id: `fee-${def.key}`,
      section: def.section,
      item: def.item,
      amount,
      amountLabel: `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo`,
      matchedRateLineId: match?.id,
      matchedRateItem: match?.item,
    });
  }

  const effectiveRate = avg((s) => s.effectiveRate ?? 0);
  if (effectiveRate > 0) {
    const match = matchRateLineForFee('effective rate', ['rate', 'discount', 'interchange'], ourRateLines);
    rows.unshift({
      id: 'fee-effective-rate',
      section: 'Card Processing',
      item: 'Effective processing rate',
      amount: effectiveRate,
      amountLabel: `${effectiveRate.toFixed(2)}%`,
      matchedRateLineId: match?.id,
      matchedRateItem: match?.item,
    });
  }

  const totalFees = avg((s) => s.totalFees ?? 0);
  if (totalFees > 0) {
    rows.push({
      id: 'fee-total',
      section: 'General',
      item: 'Total fees (statement)',
      amount: totalFees,
      amountLabel: `$${totalFees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo`,
    });
  }

  return rows.map((r) => ({
    ...r,
    section: normalizeScheduleASection(r.section),
  }));
}
