import type { BillParseFlag, BillParseLineItem, BillParseResult } from '@/lib/bill-parse-types';
import { getUcaasPhoneLines } from '@/lib/bill-parse-phones';

function formatMoney(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Titles / place abbreviations that end with a period but are not sentence boundaries. */
const SUMMARY_ABBREVIATIONS =
  /\b(?:St|Mt|Ft|Mr|Mrs|Ms|Dr|Jr|Sr|Prof|Rev|Gen|Col|Capt|Sgt|Ave|Blvd|Rd|Dept|Inc|Ltd|Corp|Co|vs|etc|No|Vol|approx|est)\./gi;

/**
 * Split a free-text summary into sentences without breaking on "St. Mary",
 * "Dr. Smith", "Inc.", etc.
 */
export function splitSummarySentences(summary: string): string[] {
  const trimmed = summary.trim();
  if (!trimmed) return [];

  const placeholders: string[] = [];
  const protect = (match: string) => {
    const i = placeholders.length;
    placeholders.push(match);
    return `\u0000ABBREV${i}\u0000`;
  };

  let protectedText = trimmed.replace(SUMMARY_ABBREVIATIONS, protect);
  // Single-letter initials: "J. Smith" / "A. B. Corp"
  protectedText = protectedText.replace(/\b([A-Z])\.(?=\s+[A-Z])/g, protect);
  // Dotted acronyms: "U.S." / "e.g." / "i.e." / "a.m."
  protectedText = protectedText.replace(/\b(?:U\.S(?:\.A)?|e\.g|i\.e|a\.m|p\.m)\./gi, protect);

  const restore = (s: string) =>
    s.replace(/\u0000ABBREV(\d+)\u0000/g, (_, idx) => placeholders[Number(idx)] ?? '');

  return protectedText
    .split(/(?<=[.!?])\s+/)
    .map((s) => restore(s).trim())
    .filter(Boolean);
}

function feeLabel(key: string): string {
  const labels: Record<string, string> = {
    interchange: 'Interchange',
    processingMarkup: 'Processing markup',
    networkFees: 'Network fees',
    nonQualSurcharge: 'Non-qualified surcharge',
    authFees: 'Authorization fees',
    bascStand: 'BASC / STAND',
    stmtMail: 'Statement / mail fees',
    acctFee: 'Account fee',
    otherFixed: 'Other fixed fees',
  };
  return labels[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

/** Build scannable line items from structured parse data or known fields. */
export function buildBillParseLineItems(result: BillParseResult, vendorName: string): BillParseLineItem[] {
  if (result.lineItems?.length) return result.lineItems;

  const items: BillParseLineItem[] = [
    { label: 'Supplier', value: vendorName || result.vendorName || '—' },
    { label: 'Service category', value: result.categoryLabel },
  ];

  if (result.serviceName) {
    items.push({ label: 'Service / plan', value: result.serviceName });
  }
  if (result.processorName) {
    items.push({ label: 'Processor', value: result.processorName });
  }
  if (result.monthlyAmount != null && Number.isFinite(result.monthlyAmount)) {
    items.push({ label: 'Monthly total', value: formatMoney(result.monthlyAmount) });
  }

  const ms = result.merchantStatement;
  if (ms) {
    if (ms.statementDate) items.push({ label: 'Statement period', value: ms.statementDate });
    if (ms.merchantName && ms.merchantName !== 'Unknown') {
      items.push({ label: 'Merchant name', value: ms.merchantName });
    }
    if (ms.totalVolume > 0) {
      items.push({ label: 'Processing volume', value: formatMoney(ms.totalVolume) });
    }
    if (ms.totalFees > 0) {
      items.push({ label: 'Total fees', value: formatMoney(ms.totalFees) });
    }
    if (ms.transactionCount > 0) {
      items.push({
        label: 'Transactions',
        value: ms.transactionCount.toLocaleString(),
        quantity: ms.avgTicket > 0 ? `avg ${formatMoney(ms.avgTicket)}` : null,
      });
    }
    if (ms.effectiveRate > 0) {
      items.push({ label: 'Effective rate', value: `${ms.effectiveRate.toFixed(2)}%` });
    }
    if (ms.pricingModel) {
      items.push({
        label: 'Pricing model',
        value: ms.pricingModel.replace(/_/g, ' '),
      });
    }

    for (const [key, amount] of Object.entries(ms.feeBreakdown)) {
      if (typeof amount === 'number' && amount > 0) {
        items.push({ label: feeLabel(key), value: formatMoney(amount) });
      }
    }
  }

  return items;
}

export function buildBillParseFlags(result: BillParseResult): BillParseFlag[] {
  if (result.flags?.length) return result.flags;

  if (result.confidence === 'low' || result.confidence === 'medium') {
    return [
      {
        question:
          'We had limited confidence reading some fields on this bill. Please review the details below and tell us anything we should correct in the notes.',
        severity: result.confidence === 'low' ? 'high' : 'medium',
      },
    ];
  }

  return [];
}

/** Plain-language bullets for the confirmation section. */
export function buildBillParseSummaryBullets(
  result: BillParseResult,
  vendorName: string,
): string[] {
  const bullets: string[] = [];
  const supplier = vendorName || result.vendorName;
  if (supplier) bullets.push(`Supplier: ${supplier}`);
  bullets.push(`Category: ${result.categoryLabel}`);
  if (result.serviceName) bullets.push(`Service or plan: ${result.serviceName}`);
  if (result.monthlyAmount != null && Number.isFinite(result.monthlyAmount)) {
    bullets.push(`Monthly spend detected: ${formatMoney(result.monthlyAmount)}`);
  }

  const phoneLines = getUcaasPhoneLines(result);
  if (phoneLines.length > 0) {
    const primary = phoneLines.find((l) => l.isPrimary);
    bullets.push(
      `${phoneLines.length} phone number${phoneLines.length === 1 ? '' : 's'} detected on this bill` +
        (primary ? ` (primary: ${primary.number})` : ''),
    );
  }

  const ms = result.merchantStatement;
  if (ms) {
    if (ms.totalFees != null && ms.totalFees > 0) {
      bullets.push(`Processing fees this period: ${formatMoney(ms.totalFees)}`);
    }
    if (ms.transactionCount != null && ms.transactionCount > 0) {
      bullets.push(`${ms.transactionCount.toLocaleString()} card transactions on this statement`);
    }
  }

  if (result.summary?.trim()) {
    const parts = splitSummarySentences(result.summary);
    for (const part of parts) {
      if (!bullets.some((b) => b.toLowerCase().includes(part.slice(0, 24).toLowerCase()))) {
        bullets.push(part);
      }
    }
  }

  return bullets;
}
