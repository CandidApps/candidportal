/**
 * Detect a supplier contract (signing link or attachment) in an inbound email.
 */

export type DetectedSupplierContract = {
  source: 'link' | 'attachment' | 'body';
  url?: string;
  name?: string;
  excerpt?: string;
};

const SIGNING_HOST_PATTERN =
  /(?:docusign|hellosign|dropboxsign|pandadoc|signnow|adobe\.com|app\.useplato|docu?sign)/i;

const CONTRACT_URL_PATTERN =
  /https?:\/\/[^\s<>"']+(?:docusign|hellosign|dropboxsign|pandadoc|signnow|adobe\.com\/[^\s<>"']*sign|app\.useplato|contract|agreement)[^\s<>"']*/gi;

const ANY_URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

const PDF_URL_PATTERN =
  /https?:\/\/[^\s<>"']+\.(?:pdf|docx?)(?:\?[^\s<>"']*)?/gi;

const CONTRACT_KEYWORDS =
  /\b(please\s+sign|ready\s+for\s+signature|signature\s+request|e-?sign|contract\s+(?:is\s+)?ready|attached\s+(?:is\s+)?(?:the\s+)?contract|countersign|here(?:'s|\s+is)\s+(?:the\s+)?contract|the\s+contract|contract\s+link|contract\s+attached|signed\s+contract|see\s+(?:the\s+)?(?:attached\s+)?contract)\b/i;

const LIGHT_CONTRACT_MENTION = /\b(contract|agreement|msa|order\s+form|sow|proposal)\b/i;

/** Strip tags / decode hrefs so HTML emails are searchable as text + URLs. */
export function normalizeEmailBodyForDetection(raw: string): {
  text: string;
  links: string[];
} {
  const links = new Set<string>();
  const hrefs = raw.matchAll(/href\s*=\s*["']([^"']+)["']/gi);
  for (const m of hrefs) {
    const url = m[1]?.trim();
    if (url && /^https?:\/\//i.test(url)) links.add(url);
  }

  // Preserve paragraph breaks for display; only collapse horizontal whitespace.
  let text = raw
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  for (const m of text.matchAll(ANY_URL_PATTERN)) {
    if (m[0]) links.add(m[0].replace(/[),.;]+$/, ''));
  }

  return { text, links: [...links] };
}

export function detectContractInEmailContent(input: {
  subject?: string;
  body?: string;
  hasAttachment?: boolean;
}): DetectedSupplierContract | null {
  const rawBody = input.body ?? '';
  const subject = input.subject ?? '';
  const { text, links } = normalizeEmailBodyForDetection(rawBody);
  const combined = `${subject}\n${text}\n${links.join('\n')}`;
  const excerpt = text.slice(0, 400).trim() || subject;

  const signingFromList = links.find((u) => SIGNING_HOST_PATTERN.test(u));
  if (signingFromList) {
    return {
      source: 'link',
      url: signingFromList,
      name: 'Supplier signing link',
      excerpt,
    };
  }

  const signingLinks = combined.match(CONTRACT_URL_PATTERN);
  if (signingLinks?.length) {
    return {
      source: 'link',
      url: signingLinks[0],
      name: 'Supplier signing link',
      excerpt,
    };
  }

  const pdfFromList = links.find((u) => /\.(?:pdf|docx?)(?:\?|$)/i.test(u));
  if (pdfFromList && (CONTRACT_KEYWORDS.test(combined) || LIGHT_CONTRACT_MENTION.test(combined))) {
    const name = decodeURIComponent(pdfFromList.split('/').pop()?.split('?')[0] ?? 'Contract.pdf');
    return { source: 'link', url: pdfFromList, name, excerpt };
  }

  const pdfLinks = combined.match(PDF_URL_PATTERN);
  if (pdfLinks?.length && (CONTRACT_KEYWORDS.test(combined) || LIGHT_CONTRACT_MENTION.test(combined))) {
    const url = pdfLinks[0];
    const name = decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? 'Contract.pdf');
    return { source: 'link', url, name, excerpt };
  }

  // "here is the contract" + any https link (Drive, Dropbox, SharePoint, short links, etc.)
  if (links.length && (CONTRACT_KEYWORDS.test(combined) || /\bhere(?:'s|\s+is)\b/i.test(combined))) {
    if (LIGHT_CONTRACT_MENTION.test(combined)) {
      return {
        source: 'link',
        url: links[0],
        name: 'Contract link',
        excerpt,
      };
    }
  }

  if (input.hasAttachment && (CONTRACT_KEYWORDS.test(combined) || LIGHT_CONTRACT_MENTION.test(combined))) {
    return {
      source: 'attachment',
      name: 'Supplier contract attachment',
      excerpt: excerpt || `Attachment on: ${subject || 'reply'}`.trim(),
    };
  }

  if (input.hasAttachment && text.trim().length > 0) {
    return {
      source: 'attachment',
      name: subject?.trim() || 'Supplier attachment',
      excerpt,
    };
  }

  if (CONTRACT_KEYWORDS.test(combined) && text.trim().length > 10) {
    return {
      source: 'body',
      name: 'Contract details in email',
      excerpt,
    };
  }

  // Soft: mentions "contract" and has any link.
  if (LIGHT_CONTRACT_MENTION.test(combined) && links.length) {
    return {
      source: 'link',
      url: links[0],
      name: 'Possible contract link',
      excerpt,
    };
  }

  return null;
}
