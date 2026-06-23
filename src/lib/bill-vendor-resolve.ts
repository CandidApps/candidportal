import type { BillParseResult } from '@/lib/bill-parse-types';

/** Payment processors / suppliers we recognize on statements and filenames. */
const KNOWN_PROCESSORS: { label: string; pattern: RegExp }[] = [
  { label: 'Worldpay', pattern: /\bworldpay\b|\bfiserv\b|\bvantiv\b/i },
  { label: 'Fiserv', pattern: /\bfiserv\b/i },
  { label: 'Square', pattern: /\bsquare\b/i },
  { label: 'Stripe', pattern: /\bstripe\b/i },
  { label: 'Clover', pattern: /\bclover\b/i },
  { label: 'Elavon', pattern: /\belavon\b/i },
  { label: 'Heartland', pattern: /\bheartland\b/i },
  { label: 'PaymentCloud', pattern: /\bpayment\s*cloud\b|\bpaymentcloud\b/i },
  { label: 'Nuvei', pattern: /\bnuvei\b/i },
  { label: 'PayJunction', pattern: /\bpayjunction\b/i },
  { label: 'Authorize.net', pattern: /\bauthorize\.?net\b/i },
  { label: 'Chase Paymentech', pattern: /\bchase\s*paymentech\b|\bpaymentech\b/i },
  { label: 'First Data', pattern: /\bfirst\s*data\b/i },
  { label: 'TSYS', pattern: /\btsys\b|\btotal\s*system\s*services\b/i },
  { label: 'Global Payments', pattern: /\bglobal\s*payments\b/i },
  { label: 'Linked2Pay', pattern: /\blinked\s*2\s*pay\b|\blinked2pay\b/i },
  { label: 'RingCentral', pattern: /\bringcentral\b/i },
  { label: 'Vonage', pattern: /\bvonage\b/i },
  { label: 'Comcast Business', pattern: /\bcomcast\b/i },
  { label: 'AT&T', pattern: /\bat&t\b|\batt\s+business\b/i },
];

function normalizeCandidate(value?: string | null): string | undefined {
  const s = value?.trim();
  return s || undefined;
}

/** File references, MIDs, and auto-generated upload names — not real vendor names. */
export function looksLikeGarbageVendorName(name?: string | null): boolean {
  const s = normalizeCandidate(name);
  if (!s) return true;

  const lower = s.toLowerCase();
  if (lower === 'unknown' || lower === 'n/a' || lower === 'pending analysis') return true;

  // e.g. 0JZ681-BIMERFIN-01-08-2026-1686906110 (1)
  if (/^[A-Z0-9]{4,}-[A-Z0-9][A-Z0-9-]*\d{6,}/i.test(s)) return true;
  if (/\(\d+\)\s*$/.test(s) && s.includes('-') && /\d{8,}/.test(s)) return true;

  // Long dashed alphanumeric tokens without spaces (statement export IDs)
  if (!/\s/.test(s) && s.length >= 24 && (s.match(/-/g)?.length ?? 0) >= 2) return true;

  // Mostly non-letters
  const letters = (s.match(/[a-z]/gi) ?? []).length;
  if (s.length >= 12 && letters / s.length < 0.35) return true;

  return false;
}

export function findKnownProcessorInText(...parts: Array<string | undefined | null>): string | undefined {
  const haystack = parts.filter(Boolean).join(' ');
  if (!haystack.trim()) return undefined;

  for (const { label, pattern } of KNOWN_PROCESSORS) {
    if (pattern.test(haystack)) return label;
  }
  return undefined;
}

export function resolveBillVendorName({
  parseResult,
  filename,
  userLabel,
}: {
  parseResult: BillParseResult;
  filename?: string;
  userLabel?: string;
}): string {
  const fromUser = normalizeCandidate(userLabel);
  if (fromUser && !looksLikeGarbageVendorName(fromUser)) {
    return fromUser;
  }

  const fromProcessorField = normalizeCandidate(parseResult.processorName);
  if (fromProcessorField && !looksLikeGarbageVendorName(fromProcessorField)) {
    return fromProcessorField;
  }

  const fromParsedVendor = normalizeCandidate(parseResult.vendorName);
  if (fromParsedVendor && !looksLikeGarbageVendorName(fromParsedVendor)) {
    return fromParsedVendor;
  }

  const fromKnown = findKnownProcessorInText(
    parseResult.processorName,
    parseResult.vendorName,
    parseResult.serviceName,
    parseResult.summary,
    filename,
  );
  if (fromKnown) return fromKnown;

  if (fromUser) return fromUser;
  if (fromParsedVendor) return fromParsedVendor;

  const merchant = normalizeCandidate(parseResult.merchantStatement?.merchantName);
  if (merchant && !looksLikeGarbageVendorName(merchant)) {
    return merchant;
  }

  return 'Unknown vendor';
}
