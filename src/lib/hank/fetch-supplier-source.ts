import type { SupabaseClient } from '@supabase/supabase-js';
import {
  mapSourceRow,
  parseSourceDbId,
  type DbSourceWithProvider,
} from '@/lib/supplier-sources-db';
import type { AnthropicToolDefinition } from '@/lib/hank/server';

const SOURCE_SELECT = `
  id, provider_id, title, url, source_type, frank_use, visible_in_portal, sort_order, created_at, updated_at,
  solution_providers ( id, slug, name, display_name )
`;

const MAX_FETCH_CHARS = 14000;
const FETCH_TIMEOUT_MS = 12000;

export const HANK_SUPPLIER_SOURCE_PROMPT = `
## Supplier source pages
You have fetch_supplier_source to read allowlisted supplier reference URLs from Partners → Sources & references.
Only fetch sources marked [frank:fetch]. Never fetch arbitrary websites. Prefer guides first; fetch sources when you need live page steps or pricing from a listed link.
`.trim();

export const HANK_SUPPLIER_SOURCE_TOOLS: AnthropicToolDefinition[] = [
  {
    name: 'fetch_supplier_source',
    description:
      'Fetch and read plain text from an allowlisted supplier source URL (Partners → Sources). Pass source_id (preferred, e.g. source-12) or an exact url from the SUPPLIER REFERENCE SOURCES list. Refuses URLs not in that catalog or marked cite/ignore.',
    input_schema: {
      type: 'object',
      properties: {
        source_id: {
          type: 'string',
          description: 'Source id from the prompt list, e.g. source-12',
        },
        url: {
          type: 'string',
          description: 'Exact URL from an allowlisted supplier source (if source_id unknown)',
        },
      },
      additionalProperties: false,
    },
  },
];

export type HankSourceFetchOptions = {
  /** Member portal: only visible_in_portal sources. */
  portalOnly?: boolean;
};

function normalizeUrlKey(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = '';
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    u.pathname = path;
    return u.toString().toLowerCase();
  } catch {
    return raw.trim().toLowerCase().replace(/\/$/, '');
  }
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '0.0.0.0' || host === '::1' || host === '[::1]') return true;
  // IPv4 private / link-local / metadata
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

function assertSafeHttpUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('Invalid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed');
  }
  if (isPrivateHostname(u.hostname)) {
    throw new Error('That host is not allowed');
  }
  return u;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr|br|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function fetchPageText(url: string): Promise<{ titleHint: string; text: string; status: number }> {
  const safe = assertSafeHttpUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(safe.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
        'User-Agent': 'CandidFrankBot/1.0 (+https://candid.solutions; supplier-source reader)',
      },
    });
    const contentType = res.headers.get('content-type') ?? '';
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 2_000_000) {
      throw new Error('Page is too large to read');
    }
    const raw = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    let text: string;
    if (/html/i.test(contentType) || /<html/i.test(raw.slice(0, 500))) {
      text = htmlToPlainText(raw);
    } else {
      text = raw.trim();
    }
    if (!text) throw new Error('Page had no readable text');
    if (text.length > MAX_FETCH_CHARS) {
      text = `${text.slice(0, MAX_FETCH_CHARS)}\n… (truncated)`;
    }
    const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const titleHint = titleMatch ? htmlToPlainText(titleMatch[1]).slice(0, 200) : '';
    return { titleHint, text, status: res.status };
  } finally {
    clearTimeout(timer);
  }
}

async function loadAllowlistedSource(
  admin: SupabaseClient,
  opts: HankSourceFetchOptions,
  input: { sourceId?: string; url?: string },
): Promise<ReturnType<typeof mapSourceRow> | null> {
  const dbId = input.sourceId ? parseSourceDbId(input.sourceId) : null;
  if (dbId) {
    let q = admin.from('solution_provider_sources').select(SOURCE_SELECT).eq('id', dbId);
    if (opts.portalOnly) q = q.eq('visible_in_portal', true);
    const { data, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return mapSourceRow(data as unknown as DbSourceWithProvider);
  }

  const url = input.url?.trim();
  if (!url) return null;

  let q = admin.from('solution_provider_sources').select(SOURCE_SELECT).neq('url', '');
  if (opts.portalOnly) q = q.eq('visible_in_portal', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const key = normalizeUrlKey(url);
  const match = ((data ?? []) as unknown as DbSourceWithProvider[]).find(
    (row) => normalizeUrlKey(row.url) === key,
  );
  return match ? mapSourceRow(match) : null;
}

export async function hankFetchSupplierSource(
  admin: SupabaseClient,
  input: Record<string, unknown>,
  opts: HankSourceFetchOptions = {},
): Promise<string> {
  const sourceId = String(input.source_id ?? '').trim();
  const url = String(input.url ?? '').trim();
  if (!sourceId && !url) {
    return 'Error: source_id or url is required';
  }

  const source = await loadAllowlistedSource(admin, opts, { sourceId, url });
  if (!source) {
    return 'Error: That URL is not in supplier Sources & references. Refuse to browse sites that are not listed there.';
  }
  if (source.frankUse === 'ignore') {
    return 'Error: This source is hidden from Frank (frank_use=ignore).';
  }
  if (source.frankUse === 'cite') {
    return JSON.stringify({
      ok: false,
      reason: 'cite_only',
      sourceId: source.id,
      title: source.title,
      url: source.url,
      message: 'This source is cite/link only — do not fetch. Share the URL and title instead.',
    });
  }
  if (!source.url?.trim()) {
    return 'Error: Source has no URL';
  }

  try {
    const page = await fetchPageText(source.url);
    return JSON.stringify({
      ok: true,
      sourceId: source.id,
      provider: source.providerName,
      title: source.title,
      sourceType: source.sourceType,
      url: source.url,
      httpStatus: page.status,
      pageTitle: page.titleHint || null,
      content: page.text,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Fetch failed';
    return JSON.stringify({
      ok: false,
      sourceId: source.id,
      title: source.title,
      url: source.url,
      error: message,
      hint: 'Tell the user the page could not be read and cite the link instead.',
    });
  }
}

export function createHankSourceFetchToolRunner(
  admin: SupabaseClient,
  opts: HankSourceFetchOptions = {},
) {
  return async (name: string, input: Record<string, unknown>): Promise<string> => {
    if (name !== 'fetch_supplier_source') return `Error: unknown tool ${name}`;
    try {
      return await hankFetchSupplierSource(admin, input, opts);
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : 'Fetch failed'}`;
    }
  };
}
