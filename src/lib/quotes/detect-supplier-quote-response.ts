/**
 * Detect pricing / quote content in a supplier email reply.
 */
export type DetectedSupplierQuote = {
  source: 'link' | 'attachment' | 'body';
  url?: string;
  name?: string;
  mimeType?: string;
  excerpt?: string;
};

const QUOTE_URL_PATTERN =
  /https?:\/\/[^\s<>"']+\.(?:pdf|docx?|xlsx?|png|jpe?g|webp)(?:\?[^\s<>"']*)?/gi;

const PRICING_KEYWORDS =
  /\b(quote|pricing|proposal|rate\s*schedule|schedule\s*a|per\s*month|\/mo|total|monthly)\b/i;

export function detectQuoteInEmailContent(input: {
  subject?: string;
  body?: string;
  hasAttachment?: boolean;
}): DetectedSupplierQuote | null {
  const body = input.body ?? '';
  const subject = input.subject ?? '';

  const urlMatches = body.match(QUOTE_URL_PATTERN) ?? subject.match(QUOTE_URL_PATTERN);
  if (urlMatches?.length) {
    const url = urlMatches[0];
    const name = decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? 'Supplier quote');
    return { source: 'link', url, name, excerpt: body.slice(0, 280).trim() };
  }

  if (input.hasAttachment) {
    return {
      source: 'attachment',
      name: 'Supplier attachment',
      excerpt: `Attachment on: ${subject || 'reply'}`.trim(),
    };
  }

  if (PRICING_KEYWORDS.test(body) && body.trim().length > 40) {
    return {
      source: 'body',
      name: 'Pricing in email body',
      excerpt: body.slice(0, 400).trim(),
    };
  }

  return null;
}
