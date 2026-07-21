import type { BillParseResult } from '@/lib/bill-parse-types';
import type { CurrentFeeLine } from '@/lib/analysis/types';
import type { MerchantStatementForm } from '@/lib/candid-pay/merchant-analysis';
import { buildMerchantAnalysisSnapshot } from '@/lib/candid-pay/merchant-analysis';
import type { StatementData } from '@/lib/candid-pay/statementParser';
import { buildCurrentFeeLines } from '@/lib/analysis/current-fee-breakdown';
import { quoteItemsFromSnapshot } from '@/lib/quotes/quote-items';
import type { ScheduleARateLine } from '@/lib/schedule-a-types';
import type { QuoteMerchantSnapshot, PublishedQuoteSnapshot } from '@/lib/quotes/types';
import type { QuoteRequestRow } from '@/lib/services/quote-requests';

export function merchantFormFromQuoteRow(row: QuoteRequestRow): MerchantStatementForm {
  const answers = row.service_answers ?? {};
  const volume = Number(answers.monthlyVolume ?? 0);
  return {
    merchantName: row.company?.trim() ?? '',
    mcc: String(answers.mccOrIndustry ?? ''),
    statementPeriod: '',
    contactName: row.contact_name?.trim() ?? '',
    contactTitle: '',
    contactEmail: row.contact_email?.trim() ?? '',
    contactPhone: row.contact_phone?.trim() ?? '',
    ccVolume: String(Number.isFinite(volume) ? volume : 0),
    achVolume: '0',
    transactionCount: '0',
    currentEffectiveRate: '0',
    pricingModel: 'interchange_plus',
    currentMarkupBps: '0',
    cardPresentPct: '70',
    equipment: String(answers.equipmentNeeds ?? ''),
    currentCCRate: '',
    currentACHRate: '',
    bascStand: '0',
    stmtMail: '0',
    nonQualFee: '0',
    agentName: '',
    agentTier: 'standard',
  };
}

export function merchantFormForQuote(
  row: QuoteRequestRow,
  merchantQuote?: QuoteMerchantSnapshot | null,
): MerchantStatementForm {
  const base = merchantFormFromQuoteRow(row);
  if (!merchantQuote?.statements?.length) return base;
  const { form } = buildMerchantAnalysisSnapshot(merchantQuote.statements, false);
  return {
    ...base,
    ...form,
    merchantName: merchantQuote.vendorName?.trim() || form.merchantName || base.merchantName,
    mcc: form.mcc || base.mcc,
    ccVolume: form.ccVolume || base.ccVolume,
    currentEffectiveRate: form.currentEffectiveRate || base.currentEffectiveRate,
    currentMarkupBps: form.currentMarkupBps || base.currentMarkupBps,
    pricingModel: form.pricingModel || base.pricingModel,
  };
}

export function quoteMerchantSnapshotFromParse(
  parseResult: BillParseResult,
  filename: string,
  ourRateLines: ScheduleARateLine[] = [],
): QuoteMerchantSnapshot | null {
  const stmt = parseResult.merchantStatement;
  if (!stmt || parseResult.category !== 'merchant_services') return null;
  const statements = [stmt];
  return {
    vendorName: parseResult.vendorName?.trim() || filename.replace(/\.[^.]+$/, ''),
    filename,
    statements,
    currentFeeLines: buildCurrentFeeLines(statements, ourRateLines),
  };
}

/** Apply admin-edited fee rows back onto the latest statement month. */
export function applyFeeLinesToStatements(
  statements: StatementData[],
  feeLines: CurrentFeeLine[],
): StatementData[] {
  if (!statements.length) return statements;
  const out = statements.map((s) => ({
    ...s,
    feeBreakdown: { ...s.feeBreakdown },
  }));
  const last = out[out.length - 1]!;
  for (const line of feeLines) {
    if (line.id === 'fee-effective-rate') {
      last.effectiveRate = line.amount;
      continue;
    }
    if (line.id === 'fee-total') {
      last.totalFees = line.amount;
      continue;
    }
    if (!line.id.startsWith('fee-')) continue;
    const key = line.id.slice(4) as keyof NonNullable<StatementData['feeBreakdown']>;
    if (!last.feeBreakdown) last.feeBreakdown = {} as StatementData['feeBreakdown'];
    if (key in last.feeBreakdown) {
      (last.feeBreakdown as Record<string, number>)[key] = line.amount;
    }
  }
  return out;
}

export function refreshFeeLines(
  statements: StatementData[],
  ourRateLines: ScheduleARateLine[],
  previous?: import('@/lib/analysis/types').CurrentFeeLine[],
): import('@/lib/analysis/types').CurrentFeeLine[] {
  const built = buildCurrentFeeLines(statements, ourRateLines);
  if (!previous?.length) return built;
  const byId = new Map(previous.map((l) => [l.id, l]));
  return built.map((row) => {
    const prior = byId.get(row.id);
    if (!prior || prior.amount === row.amount) return row;
    return {
      ...row,
      amount: prior.amount,
      amountLabel: prior.amountLabel,
    };
  });
}

export function snapshotHasMerchantSavingsView(snapshot: PublishedQuoteSnapshot): boolean {
  const sources: Array<Pick<PublishedQuoteSnapshot, 'pricingStructureOptions'>> = [
    snapshot,
    ...quoteItemsFromSnapshot(snapshot),
  ];
  return sources.some((s) => s.pricingStructureOptions?.some((o) => o.selected));
}
