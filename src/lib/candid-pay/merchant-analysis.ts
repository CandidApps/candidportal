import {
  avgFeeField,
  avgField,
  fileToBase64,
  parseStatementWithClaude,
  sortStatements,
  type StatementData,
} from '@/lib/candid-pay/statementParser';
import { calcFlat3Savings, fmt$ } from '@/lib/candid-pay/pricingEngine';
import type {
  MerchantAnalysisProvider,
  PricingStructureOption,
  ProviderSavingsQuote,
} from '@/lib/analysis/types';
import { isInterchangePlusStructure } from '@/lib/analysis/statement-pricing-model';

export type MerchantStatementForm = {
  merchantName: string;
  mcc: string;
  statementPeriod: string;
  contactName: string;
  contactTitle: string;
  contactEmail: string;
  contactPhone: string;
  ccVolume: string;
  achVolume: string;
  transactionCount: string;
  currentEffectiveRate: string;
  pricingModel: string;
  currentMarkupBps: string;
  cardPresentPct: string;
  equipment: string;
  currentCCRate: string;
  currentACHRate: string;
  bascStand: string;
  stmtMail: string;
  nonQualFee: string;
  agentName: string;
  agentTier: string;
};

export type MerchantAnalysisSnapshot = {
  statements: StatementData[];
  form: MerchantStatementForm;
  generated: boolean;
  savedAt: string;
  /** Admin-configured merchant services providers with Our Rate sell schedules */
  analysisProviders?: MerchantAnalysisProvider[];
  providerQuotes?: ProviderSavingsQuote[];
  /** Admin-selected pricing structures included in the customer proposal */
  pricingStructureOptions?: PricingStructureOption[];
  /** Merchant services partner used for proposed rates */
  matchedProviderName?: string;
  /** Note from admin when analysis was published */
  adminMessage?: string;
};

export function buildFormFromStatements(stmts: StatementData[]): MerchantStatementForm {
  if (!stmts.length) {
    return emptyMerchantForm();
  }
  const sorted = sortStatements(stmts);
  const latest = sorted[sorted.length - 1];
  const period =
    sorted.length === 1
      ? latest.statementDate
      : `${sorted[0].statementDate} – ${latest.statementDate}`;

  return {
    ...emptyMerchantForm(),
    merchantName: latest.merchantName || '',
    statementPeriod: period,
    ccVolume: avgField(sorted, 'totalVolume').toFixed(2),
    transactionCount: Math.round(avgField(sorted, 'transactionCount')).toString(),
    currentEffectiveRate: avgField(sorted, 'effectiveRate').toFixed(2),
    currentMarkupBps: isInterchangePlusStructure(latest.pricingModel, latest)
      ? Math.round(avgField(sorted, 'processingMarkupBps')).toString()
      : '0',
    pricingModel: latest.pricingModel || '',
    currentCCRate: latest.effectiveRate?.toFixed(2) || '',
    bascStand: avgFeeField(sorted, 'bascStand').toFixed(2),
    stmtMail: avgFeeField(sorted, 'stmtMail').toFixed(2),
    nonQualFee: avgFeeField(sorted, 'nonQualSurcharge').toFixed(2),
  };
}

export function emptyMerchantForm(): MerchantStatementForm {
  return {
    merchantName: '',
    mcc: '',
    statementPeriod: '',
    contactName: '',
    contactTitle: '',
    contactEmail: '',
    contactPhone: '',
    ccVolume: '',
    achVolume: '',
    transactionCount: '',
    currentEffectiveRate: '',
    pricingModel: '',
    currentMarkupBps: '',
    cardPresentPct: '60',
    equipment: 'pos',
    currentCCRate: '',
    currentACHRate: '',
    bascStand: '',
    stmtMail: '',
    nonQualFee: '',
    agentName: '',
    agentTier: 'standard',
  };
}

export function buildMerchantAnalysisSnapshot(
  statements: StatementData[],
  generated = true
): MerchantAnalysisSnapshot {
  return {
    statements: sortStatements(statements),
    form: buildFormFromStatements(statements),
    generated,
    savedAt: new Date().toISOString(),
  };
}

export async function parseMerchantStatementPdf(file: File): Promise<StatementData> {
  const b64 = await fileToBase64(file);
  return parseStatementWithClaude(b64);
}

export function merchantVendorSummary(snapshot: MerchantAnalysisSnapshot): string {
  const rate = parseFloat(snapshot.form.currentEffectiveRate) || 0;
  const vol = parseFloat(snapshot.form.ccVolume) || 0;
  const flat3 = calcFlat3Savings({
    currentEffectiveRate: rate,
    ccVolume: vol,
  });
  const savings =
    flat3.monthlySavings > 0
      ? ` — Est. savings ${fmt$(flat3.monthlySavings)}/mo`
      : '';
  return `Effective rate ${rate.toFixed(2)}%${savings}`;
}

export function monthlyFeesCents(snapshot: MerchantAnalysisSnapshot): number | null {
  const latest = snapshot.statements[snapshot.statements.length - 1];
  if (!latest?.totalFees) return null;
  return Math.round(latest.totalFees * 100);
}
