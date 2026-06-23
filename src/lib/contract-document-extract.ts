import { parseContractHintsFromFile } from '@/lib/customer-records';
import { fileToBase64 } from '@/lib/candid-pay/statementParser';
import { mediaTypeForCustomerDocument } from '@/lib/customer-document-extract';

export type ContractDocumentExtractResult = {
  provider?: string;
  product?: string;
  serviceDescription?: string;
  mrc?: number;
  mrr?: number;
  contractStartDate?: string;
  contractEndDate?: string;
  paySource?: string;
  dealId?: string;
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
    let serverMessage: string | undefined;
    try {
      const errBody = (await res.json()) as { error?: string };
      serverMessage = errBody.error;
    } catch {
      /* ignore */
    }
    throw new Error(
      res.status === 503
        ? serverMessage ?? 'Contract parsing is not configured on the server.'
        : serverMessage ??
            'Could not read this contract. Try a PDF or image, or enter details manually.',
    );
  }

  const body = (await res.json()) as {
    contract?: Record<string, unknown>;
    error?: string;
  };
  if (body.error) throw new Error(body.error);
  const raw = body.contract;
  if (!raw) return hintsFromFilename(file);

  return {
    provider: pickString(raw.provider, raw.solution, raw.vendor),
    product: pickString(raw.product),
    serviceDescription: pickString(raw.serviceDescription, raw.service),
    mrc: pickNumber(raw.mrc) ?? pickNumber(raw.mrr),
    mrr: pickNumber(raw.mrr) ?? pickNumber(raw.mrc),
    contractStartDate: pickString(raw.contractStartDate),
    contractEndDate: pickString(raw.contractEndDate),
    paySource: pickString(raw.paySource),
    dealId: pickString(raw.dealId),
    source: 'ai',
  };
}
