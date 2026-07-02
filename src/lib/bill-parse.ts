import type { BillParseResult } from '@/lib/bill-parse-types';
import { providerCategoryLabel, type ProviderCategory } from '@/lib/provider-categories';
import type { StatementData } from '@/lib/candid-pay/statementParser';
import { resolveBillVendorName } from '@/lib/bill-vendor-resolve';
import { dedupePhoneLines, formatPhoneDisplay } from '@/lib/bill-parse-phones';

const VALID_CATEGORIES = new Set<string>([
  'merchant_services',
  'internet',
  'ucaas',
  'ccaas',
  'mobility',
  'security',
  'cloud_saas',
  'payments_ach',
  'hardware',
  'managed_it',
  'other',
]);

function normalizeCategory(raw?: string | null): ProviderCategory | 'other' {
  const key = raw?.trim().toLowerCase().replace(/\s+/g, '_') ?? 'other';
  if (key === 'merchant' || key === 'merchant_processing' || key === 'payments') return 'merchant_services';
  if (VALID_CATEGORIES.has(key)) return key as ProviderCategory;
  return 'other';
}

function parseMerchantStatement(raw: Record<string, unknown> | undefined): StatementData | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw;
  const num = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    return parseFloat(String(v ?? 0)) || 0;
  };
  const str = (field: string) => String(r[field] ?? '').trim();
  const fee = (r.feeBreakdown as Record<string, unknown> | undefined) ?? {};
  const cards = (r.cardBreakdown as Record<string, unknown> | undefined) ?? {};

  const totalVolume = num(r.totalVolume);
  const totalFees = num(r.totalFees);
  const feeBreakdown = {
    interchange: num(fee.interchange),
    processingMarkup: num(fee.processingMarkup),
    networkFees: num(fee.networkFees),
    nonQualSurcharge: num(fee.nonQualSurcharge),
    authFees: num(fee.authFees),
    bascStand: num(fee.bascStand),
    stmtMail: num(fee.stmtMail),
    acctFee: num(fee.acctFee),
    otherFixed: num(fee.otherFixed),
  };

  let effectiveRate = num(r.effectiveRate);
  if (!effectiveRate && totalVolume > 0 && totalFees > 0) {
    effectiveRate = Math.round((totalFees / totalVolume) * 10000) / 100;
  }

  let processingMarkupBps = num(r.processingMarkupBps);
  if (!processingMarkupBps && totalVolume > 0 && feeBreakdown.processingMarkup > 0) {
    processingMarkupBps = Math.round((feeBreakdown.processingMarkup / totalVolume) * 10000);
  }

  const pricingModelRaw = str('pricingModel');
  let pricingModel = (pricingModelRaw || '') as StatementData['pricingModel'];
  if (!pricingModelRaw) {
    pricingModel = feeBreakdown.interchange > 0 ? 'interchange_plus' : 'flat_rate';
  }

  return {
    merchantName: str('merchantName') || str('businessName') || 'Unknown',
    statementDate: str('statementDate') || str('billingPeriod') || '',
    totalVolume,
    totalFees,
    transactionCount: num(r.transactionCount),
    avgTicket: num(r.avgTicket),
    cardBreakdown: {
      visa: num(cards.visa),
      mastercard: num(cards.mastercard),
      discover: num(cards.discover),
      amex: num(cards.amex),
    },
    feeBreakdown,
    pricingModel,
    pricingModelEvidence: str('pricingModelEvidence') || '',
    processingMarkupBps,
    effectiveRate,
  };
}

export function finalizeBillParseResult(
  result: BillParseResult,
  options?: { filename?: string; userLabel?: string },
): BillParseResult {
  const vendorName = resolveBillVendorName({
    parseResult: result,
    filename: options?.filename,
    userLabel: options?.userLabel,
  });
  return { ...result, vendorName   };
}

function parseUcaasPhoneLines(
  raw: Record<string, unknown>,
  category: ProviderCategory | 'other',
) {
  if (category !== 'ucaas') return undefined;
  const ucaasData = raw.ucaasData as Record<string, unknown> | undefined;
  const source = ucaasData?.phoneLines ?? raw.phoneLines;
  if (!Array.isArray(source)) return undefined;
  const lines = (source as Record<string, unknown>[])
    .map((row) => {
      const number = String(row.number ?? row.phone ?? '').trim();
      if (!number) return null;
      return {
        number: formatPhoneDisplay(number),
        label: String(row.label ?? row.description ?? '').trim() || undefined,
        isPrimary: row.isPrimary === true || row.primary === true,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  const deduped = dedupePhoneLines(lines);
  return deduped.length ? deduped : undefined;
}

export function mapRawBillParse(
  raw: Record<string, unknown>,
  options?: { filename?: string; userLabel?: string },
): BillParseResult {
  const category = normalizeCategory(String(raw.category ?? ''));
  const merchantStatement = parseMerchantStatement(
    (raw.merchantData as Record<string, unknown> | undefined) ??
      (category === 'merchant_services' ? raw : undefined),
  );

  const monthlyRaw = raw.monthlyAmount;
  const monthlyAmount =
    typeof monthlyRaw === 'number'
      ? monthlyRaw
      : typeof monthlyRaw === 'string'
        ? parseFloat(monthlyRaw.replace(/[$,]/g, '')) || undefined
        : undefined;

  const lineItems = Array.isArray(raw.lineItems)
    ? (raw.lineItems as Record<string, unknown>[])
        .map((row) => ({
          label: String(row.label ?? '').trim(),
          value: String(row.value ?? '').trim(),
          quantity: row.quantity != null ? String(row.quantity).trim() : null,
        }))
        .filter((row) => row.label && row.value)
    : undefined;

  const flags = Array.isArray(raw.flags)
    ? (raw.flags as Record<string, unknown>[])
        .map((row) => ({
          question: String(row.question ?? '').trim(),
          severity:
            row.severity === 'high' || row.severity === 'medium'
              ? (row.severity as 'high' | 'medium')
              : undefined,
        }))
        .filter((row) => row.question)
    : undefined;

  const ucaasPhoneLines = parseUcaasPhoneLines(raw, category);

  const base: BillParseResult = {
    category,
    categoryLabel: String(raw.categoryLabel ?? providerCategoryLabel(category)),
    confidence:
      raw.confidence === 'high' || raw.confidence === 'low' ? raw.confidence : 'medium',
    vendorName: String(raw.vendorName ?? raw.vendor ?? '').trim() || undefined,
    processorName:
      String(
        (raw.merchantData as Record<string, unknown> | undefined)?.processorName ??
          (raw.merchantData as Record<string, unknown> | undefined)?.processor ??
          raw.processorName ??
          '',
      ).trim() || undefined,
    serviceName: String(raw.serviceName ?? raw.product ?? '').trim() || undefined,
    monthlyAmount,
    summary: String(raw.summary ?? '').trim() || undefined,
    lineItems,
    flags,
    ucaasPhoneLines,
    merchantStatement,
  };

  return finalizeBillParseResult(base, options);
}

export async function parseBillFromFile(file: File, userLabel?: string): Promise<BillParseResult> {
  const form = new FormData();
  form.append('file', file);

  const res = await fetch('/api/parse-bill', { method: 'POST', body: form });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'Bill parsing failed');
  }
  const data = (await res.json()) as { result?: BillParseResult };
  if (!data.result) throw new Error('Bill parsing returned no data');
  return finalizeBillParseResult(data.result, { filename: file.name, userLabel });
}
