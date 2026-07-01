/** Dialpad recap emails and calendar descriptions often include a "View AI Recap" link. */

const RECAP_LINK_LABEL =
  /^(?:view\s+ai\s+recap|view\s+recap|open\s+(?:full\s+)?recap|see\s+(?:full\s+)?recap|go\s+to\s+call(?:\s+details)?)\s*[:\-]?\s*$/i;

const RECAP_LINK_LABEL_INLINE =
  /\b(?:view\s+ai\s+recap|view\s+recap|open\s+(?:full\s+)?recap)\b/gi;

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)));
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** True when a URL looks like a Dialpad call/meeting recap page (not a join link). */
export function isDialpadRecapUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!/dialpad\.com$/i.test(u.hostname.replace(/^www\./, '')) && !/\.dialpad\.com$/i.test(u.hostname)) {
      return false;
    }
    const path = u.pathname.toLowerCase();
    if (/meetings\.dialpad\.com$/i.test(u.hostname) && !path.includes('recap')) return false;
    if (/\/(call|r|recap|callhistory|callreview)\//.test(path) || /\/call\/\d+/.test(path)) return true;
    if (path.includes('recap') || path.includes('summary') || path.includes('transcript')) return true;
    if (u.searchParams.has('call_id') || u.searchParams.has('callid')) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Pulls the Dialpad AI recap URL from recap email HTML. Prefers anchors whose
 * visible text is "View AI Recap" (or similar), then any dialpad recap URL.
 */
export function extractDialpadRecapUrlFromHtml(html: string): string | null {
  if (!html?.trim()) return null;

  const anchorRe = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let best: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(html)) !== null) {
    const href = decodeHtmlEntities(match[1].trim());
    const label = stripTags(match[2]);
    if (!isDialpadRecapUrl(href)) continue;
    if (RECAP_LINK_LABEL.test(label) || RECAP_LINK_LABEL_INLINE.test(label)) return href;
    if (!best) best = href;
  }
  if (best) return best;

  const urlRe = /https?:\/\/[^\s"'<>]+/gi;
  while ((match = urlRe.exec(html)) !== null) {
    const href = decodeHtmlEntities(match[0]);
    if (isDialpadRecapUrl(href)) return href;
  }
  return null;
}

/** Finds a recap URL in plain text (after HTML was stripped). */
export function extractDialpadRecapUrlFromText(text: string): string | null {
  const urlRe = /https?:\/\/[^\s<>"']+/gi;
  let match: RegExpExecArray | null;
  while ((match = urlRe.exec(text)) !== null) {
    const href = match[0].replace(/[.,;:!?)]+$/, '');
    if (isDialpadRecapUrl(href)) return href;
  }
  return null;
}

/** Removes leading "View AI Recap" boilerplate from a parsed summary or description. */
export function stripDialpadRecapLinkText(text: string, recapUrl?: string | null): string {
  let out = text.trim();
  if (!out) return out;

  out = out.replace(/^\s*(?:view\s+ai\s+recap|view\s+recap)\s*[:\-]?\s*/i, '');
  out = out.replace(/^(?:\n\s*)+(?:view\s+ai\s+recap|view\s+recap)\s*$/im, '');
  if (recapUrl) {
    const escaped = recapUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`^\\s*${escaped}\\s*`, 'i'), '');
    out = out.replace(new RegExp(`\\s*${escaped}\\s*`, 'gi'), ' ');
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function cleanDialpadRecapContent(input: {
  html?: string | null;
  text?: string | null;
}): { text: string; recapUrl: string | null } {
  const rawHtml = input.html?.trim() ?? '';
  const rawText = input.text?.trim() ?? '';
  const recapUrl =
    (rawHtml ? extractDialpadRecapUrlFromHtml(rawHtml) : null) ??
    extractDialpadRecapUrlFromText(rawText || stripTags(rawHtml));
  const baseText = rawText || stripTags(rawHtml);
  const text = stripDialpadRecapLinkText(baseText, recapUrl);
  return { text, recapUrl };
}
