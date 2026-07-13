/** Decode HTML entities commonly found in Zoho / MIME address strings. */
export function decodeEmailEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)));
}

/** Split a To/Cc/Bcc list without breaking inside quotes or angle brackets. */
export function splitAddressList(raw: string): string[] {
  const decoded = decodeEmailEntities(raw.trim());
  if (!decoded) return [];

  const parts: string[] = [];
  let buf = '';
  let inAngle = false;
  let inQuote = false;

  for (let i = 0; i < decoded.length; i++) {
    const c = decoded[i]!;
    if (c === '"' && decoded[i - 1] !== '\\') inQuote = !inQuote;
    if (c === '<' && !inQuote) inAngle = true;
    if (c === '>' && !inQuote) inAngle = false;
    if ((c === ',' || c === ';') && !inAngle && !inQuote) {
      if (buf.trim()) parts.push(buf.trim());
      buf = '';
      continue;
    }
    buf += c;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

/** Extract a bare email from "Name <a@b.com>" or encoded variants. */
export function parseEmailAddress(raw: string): string {
  const decoded = decodeEmailEntities(raw.trim());
  if (!decoded) return '';

  const angle = decoded.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim().toLowerCase();

  const bare = decoded.match(/([^\s<>"';,]+@[^\s<>"';,]+)/);
  if (bare?.[1]) return bare[1].trim().toLowerCase();

  return decoded.trim().toLowerCase();
}

export function isValidEmailAddress(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Parse one address part into email + optional display name. */
export function parseRecipientPart(raw: string): { email: string; name?: string } {
  const decoded = decodeEmailEntities(raw.trim());
  if (!decoded) return { email: '' };

  const angle = decoded.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (angle) {
    const email = angle[2]!.trim().toLowerCase();
    const name = angle[1]!.replace(/^["']+|["']+$/g, '').trim();
    return { email, name: name || undefined };
  }

  const email = parseEmailAddress(decoded);
  return { email };
}

/** Split and parse a multi-recipient header into bare email addresses. */
export function splitEmailAddresses(raw: string): string[] {
  return splitAddressList(raw)
    .map((part) => parseEmailAddress(part))
    .filter((email) => isValidEmailAddress(email));
}

/** Split and parse a multi-recipient header into structured recipients. */
export function splitRecipientParts(raw: string): Array<{ email: string; name?: string }> {
  return splitAddressList(raw)
    .map((part) => parseRecipientPart(part))
    .filter((r) => isValidEmailAddress(r.email));
}

/** Normalize a raw address field for display/storage (decode entities, trim). */
export function normalizeAddressField(raw: string): string {
  return decodeEmailEntities(String(raw ?? '').trim());
}
