import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'a',
  'blockquote',
  'code',
  'pre',
];

const ALLOWED_ATTR = ['href', 'target', 'rel'];

export function looksLikeHtml(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content.trim());
}

/** Convert legacy plain-text guide content for the editor. */
export function plainTextToEditorHtml(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return '';
  if (looksLikeHtml(trimmed)) return sanitizeRichHtml(trimmed);
  const escaped = trimmed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<p>${escaped.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
}

export function sanitizeRichHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });
}

/** Sanitize inbound email HTML for safe preview (allows common mail layout tags). */
export function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'link', 'meta', 'base'],
  });
}

export function richHtmlToPlainText(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return '';
  if (!looksLikeHtml(trimmed)) return trimmed;

  const sanitized = sanitizeRichHtml(trimmed);
  return sanitized
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/h[23]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function isRichHtmlEmpty(html: string): boolean {
  return !richHtmlToPlainText(html).trim();
}

/**
 * Render Hank chat replies that may use HTML or light markdown (**bold**, *italic*, lists).
 * Always sanitizes before returning.
 */
export function formatHankChatHtml(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return '';
  if (looksLikeHtml(trimmed)) return sanitizeRichHtml(trimmed);

  let escaped = trimmed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  escaped = escaped.replace(/```([\s\S]*?)```/g, (_m, code: string) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  escaped = escaped.replace(/\*\*([^\*\n]+)\*\*/g, '<strong>$1</strong>');
  escaped = escaped.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  escaped = escaped.replace(/(^|[^\*])\*([^\*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  escaped = escaped.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
  escaped = escaped.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  escaped = escaped.replace(/^(?:- |\* )(.+)$/gm, '<li>$1</li>');
  escaped = escaped.replace(/(?:<li>[\s\S]*?<\/li>\n?)+/g, (block) => `<ul>${block}</ul>`);

  escaped = escaped
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>');
  if (!escaped.startsWith('<ul') && !escaped.startsWith('<pre')) {
    escaped = `<p>${escaped}</p>`;
  }

  return sanitizeRichHtml(escaped);
}
