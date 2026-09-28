import { parseContractHintsFromFile } from '@/lib/customer-records';
import { fileToBase64 } from '@/lib/candid-pay/statementParser';
import { mediaTypeForCustomerDocument } from '@/lib/customer-document-extract';
import {
  MAX_INLINE_PARSE_BASE64_CHARS,
  parseRequestErrorMessage,
  tooLargeForInlineParseMessage,
} from '@/lib/document-parse-limits';
import { normalizePricingLineItems } from '@/lib/pricing-line-items';
import type { PricingLineItem } from '@/lib/customer-records';

export type ContractDocumentExtractResult = {
  provider?: string;
  /** Service category (e.g. UCaaS). */
  service?: string;
  product?: string;
  /** Scope / narrative — not a seat dump. */
  serviceDescription?: string;
  pricingLineItems?: PricingLineItem[];
  mrc?: number;
  mrr?: number;
  estimatedTotalBill?: number;
  contractStartDate?: string;
  contractEndDate?: string;
  paySource?: string;
  dealId?: string;
  userCount?: number;
  renewalTerms?: string;
  /** Model output was cut off — some fields may be missing. */
  partial?: boolean;
  source: 'ai' | 'filename' | 'none';
};

function pickNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value.replace(/[$,]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function pickString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function hintsFromFilename(file: File): ContractDocumentExtractResult {
  const hints = parseContractHintsFromFile(file);
  return {
    dealId: hints.dealId,
    mrr: hints.mrr,
    mrc: hints.mrr,
    contractStartDate: hints.contractStartDate,
    source: 'filename',
  };
}

const CONTRACT_PARSE_FALLBACK_ERROR = 'Could not read this contract. Enter the details manually.';

export async function parseContractDocumentFromFile(
  file: File,
): Promise<ContractDocumentExtractResult> {
  const mediaType = mediaTypeForCustomerDocument(file);
  if (!mediaType) {
    return hintsFromFilename(file);
  }

  const base64 = await fileToBase64(file);
  if (!base64) {
    throw new Error('Could not read the file. Try uploading again.');
  }
  if (base64.length > MAX_INLINE_PARSE_BASE64_CHARS) {
    const fallback = hintsFromFilename(file);
    if (fallback.dealId || fallback.mrc) return fallback;
    throw new Error(tooLargeForInlineParseMessage(file.size));
  }

  const res = await fetch('/api/parse-customer-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: base64,
      mediaType,
      filename: file.name,
      extractMode: 'contract',
    }),
  });

  if (!res.ok) {
    const fallback = hintsFromFilename(file);
    if (fallback.dealId || fallback.mrc) return fallback;
    throw new Error(await parseRequestErrorMessage(res, CONTRACT_PARSE_FALLBACK_ERROR));
  }

  const result = await contractResultFromResponse(res);
  return result ?? hintsFromFilename(file);
}

/** Parse a document already saved in storage — the server reads the bytes, so size limits on uploads don't apply. */
export async function parseContractDocumentFromStorage(
  storagePath: string,
  filename: string,
): Promise<ContractDocumentExtractResult | null> {
  const res = await fetch('/api/parse-customer-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storagePath, filename, extractMode: 'contract' }),
  });
  if (!res.ok) {
    throw new Error(await parseRequestErrorMessage(res, CONTRACT_PARSE_FALLBACK_ERROR));
  }
  return contractResultFromResponse(res);
}

async function contractResultFromResponse(res: Response): Promise<ContractDocumentExtractResult | null> {
  const body = (await res.json()) as {
    contract?: Record<string, unknown> | null;
    partial?: boolean;
    error?: string;
  };
  if (body.error) throw new Error(body.error);
  const raw = body.contract;
  if (!raw) return null;

  return {
    ...(body.partial ? { partial: true } : {}),
    provider: pickString(raw.provider, raw.solution, raw.vendor),
    service: pickString(raw.service),
    product: pickString(raw.product),
    serviceDescription: pickString(raw.serviceDescription, raw.scopeOfServices, raw.description),
    pricingLineItems: normalizePricingLineItems(raw.pricingLineItems ?? raw.lineItems),
    mrc: pickNumber(raw.mrc) ?? pickNumber(raw.mrr),
    mrr: pickNumber(raw.mrr) ?? pickNumber(raw.mrc),
    estimatedTotalBill: pickNumber(raw.estimatedTotalBill) ?? pickNumber(raw.totalWithTax),
    contractStartDate: pickString(raw.contractStartDate),
    contractEndDate: pickString(raw.contractEndDate),
    paySource: pickString(raw.paySource),
    dealId: pickString(raw.dealId),
    userCount: pickNumber(raw.userCount) ?? pickNumber(raw.seatCount) ?? pickNumber(raw.licenses),
    renewalTerms: pickString(raw.renewalTerms, raw.renewalTerm),
    source: 'ai',
  };
}
