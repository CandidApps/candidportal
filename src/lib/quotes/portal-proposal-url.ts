import type { QuoteProposalDocument } from '@/lib/quotes/types';

/** Member-safe URL for a quote proposal document (rewrites legacy admin paths). */
export function portalQuoteProposalUrl(
  quoteRequestId: string | null | undefined,
  doc: QuoteProposalDocument | null | undefined,
): string | null {
  if (!doc) return null;
  const id = quoteRequestId?.trim();
  const storagePath = doc.storagePath?.trim();
  if (id && storagePath?.startsWith('quote-proposals/')) {
    return `/api/portal/quote-requests/${encodeURIComponent(id)}/proposal?path=${encodeURIComponent(storagePath)}`;
  }
  const url = doc.url?.trim();
  if (!url) return null;
  if (id && url.startsWith('/api/admin/quote-requests/')) {
    try {
      const parsed = new URL(url, 'http://localhost');
      const pathParam = parsed.searchParams.get('path');
      if (pathParam) {
        return `/api/portal/quote-requests/${encodeURIComponent(id)}/proposal?path=${encodeURIComponent(pathParam)}`;
      }
      return `/api/portal/quote-requests/${encodeURIComponent(id)}/proposal`;
    } catch {
      return url;
    }
  }
  return url;
}
