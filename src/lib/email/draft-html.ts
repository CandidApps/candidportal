import { decodeEmailEntities } from '@/lib/email/address-parse';

/** Flattens rich-text HTML into the plain-text alternative part of an email. */
export function plainFromHtml(html: string): string {
  return decodeEmailEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
}

/** Turns an AI draft's plain text into paragraph HTML for the rich-text editor. */
export function draftPlainToHtml(text: string): string {
  if (!text.trim()) return '';
  return text
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}
