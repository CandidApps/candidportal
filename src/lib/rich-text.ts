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
 * Render assistant chat replies that may use HTML or light markdown (**bold**, lists, headers).
 * Prefer HTML when tags are present so mixed replies don't escape `<strong>` as text.
 * Always sanitizes before returning.
 */
export function formatHankChatHtml(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return '';

  // Models often mix HTML with markdown markers. If real tags are present, trust HTML
  // and sanitize — never escape tags into visible text.
  if (looksLikeHtml(trimmed)) {
    return sanitizeRichHtml(trimmed);
  }

  const inlineFormat = (line: string): string => {
    let s = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
    return s;
  };

  const lines = trimmed.split('\n');
  const blocks: string[] = [];
  let ulItems: string[] = [];
  let olItems: string[] = [];

  const flushUl = () => {
    if (!ulItems.length) return;
    blocks.push(`<ul>${ulItems.map((li) => `<li>${inlineFormat(li)}</li>`).join('')}</ul>`);
    ulItems = [];
  };

  const flushOl = () => {
    if (!olItems.length) return;
    blocks.push(`<ol>${olItems.map((li) => `<li>${inlineFormat(li)}</li>`).join('')}</ol>`);
    olItems = [];
  };

  const flushLists = () => {
    flushUl();
    flushOl();
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      flushLists();
      continue;
    }

    const codeFence = trimmedLine.match(/^```(.*)$/);
    if (codeFence) {
      flushLists();
      blocks.push(`<pre><code>${codeFence[1] ?? ''}</code></pre>`);
      continue;
    }

    const h3 = trimmedLine.match(/^###\s+(.+)$/);
    if (h3) {
      flushLists();
      blocks.push(`<h3>${inlineFormat(h3[1])}</h3>`);
      continue;
    }

    const h2 = trimmedLine.match(/^##\s+(.+)$/);
    if (h2) {
      flushLists();
      blocks.push(`<h2>${inlineFormat(h2[1])}</h2>`);
      continue;
    }

    const ul = trimmedLine.match(/^[-*]\s+(.+)$/);
    if (ul) {
      flushOl();
      ulItems.push(ul[1]);
      continue;
    }

    const ol = trimmedLine.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      flushUl();
      olItems.push(ol[1]);
      continue;
    }

    flushLists();
    blocks.push(`<p>${inlineFormat(trimmedLine)}</p>`);
  }

  flushLists();

  return sanitizeRichHtml(blocks.join(''));
}
