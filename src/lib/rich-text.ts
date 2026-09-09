import createDOMPurify from 'dompurify';
import type { Config } from 'dompurify';

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

const EMAIL_FORBID_TAGS = ['script', 'iframe', 'object', 'embed', 'form', 'link', 'meta', 'base'];

let browserPurify: ReturnType<typeof createDOMPurify> | null = null;

function getBrowserPurify(): ReturnType<typeof createDOMPurify> | null {
  if (typeof window === 'undefined') return null;
  if (!browserPurify) {
    browserPurify = createDOMPurify(window);
  }
  return browserPurify;
}

/**
 * SSR / Node fallback — never load jsdom. Strips the worst XSS vectors so
 * server-side plain-text extraction and rare SSR HTML paths stay usable.
 * Browser paths always use DOMPurify.
 */
function serverSafeSanitize(html: string, mode: 'rich' | 'email'): string {
  let out = String(html);
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  for (const tag of EMAIL_FORBID_TAGS) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    out = out.replace(re, '');
    out = out.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '');
  }
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  out = out.replace(/(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, '$1=$2#$2');
  out = out.replace(/(href|src)\s*=\s*javascript:[^\s>]*/gi, '$1=#');

  if (mode === 'rich') {
    const allow = new Set(ALLOWED_TAGS.map((t) => t.toLowerCase()));
    out = out.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (full, rawName: string) => {
      const name = rawName.toLowerCase();
      if (!allow.has(name)) return '';
      if (full.startsWith('</')) return `</${name}>`;
      if (name === 'br' || name === 'hr') return `<${name}>`;
      if (name === 'a') {
        const hrefMatch = full.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
        const href = (hrefMatch?.[2] ?? hrefMatch?.[3] ?? hrefMatch?.[4] ?? '').trim();
        if (!href || /^javascript:/i.test(href)) return '<a>';
        const safe = href.replace(/"/g, '&quot;');
        return `<a href="${safe}" rel="noopener noreferrer">`;
      }
      return `<${name}>`;
    });
  }

  return out;
}

function runSanitize(html: string, config: Config, mode: 'rich' | 'email'): string {
  const purify = getBrowserPurify();
  if (purify) {
    return purify.sanitize(html, config);
  }
  return serverSafeSanitize(html, mode);
}

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
  return runSanitize(
    html,
    {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
    },
    'rich',
  );
}

/** Sanitize inbound email HTML for safe preview (allows common mail layout tags). */
export function sanitizeEmailHtml(html: string): string {
  return runSanitize(
    html,
    {
      USE_PROFILES: { html: true },
      FORBID_TAGS: [...EMAIL_FORBID_TAGS],
    },
    'email',
  );
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
