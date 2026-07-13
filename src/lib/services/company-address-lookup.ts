import { MCC_RISK_TABLE } from '@/lib/candid-pay/pricingEngine';
import { logClaudeUsageAsync } from '@/lib/claude-usage';

export type CompanyAddressLookupResult = {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  companyName?: string;
  industry?: string;
  description?: string;
  mccCode?: string;
  mccLabel?: string;
  mccRisk?: 'low' | 'mid' | 'high';
  /** Normalized LinkedIn company page URL when found. */
  linkedinUrl?: string;
  source: 'structured_data' | 'ai' | 'none';
};

type PostalAddress = {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
};

const CONTACT_PATHS = ['/contact', '/contact-us', '/about', '/about-us', '/locations'];
const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_CHARS = 120_000;

export function normalizeCompanyWebsite(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (!url.hostname.includes('.')) return null;
    if (!isPublicHostname(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Normalize a LinkedIn company page URL; returns null if not a company page. */
export function normalizeLinkedInCompanyUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    if (host !== 'linkedin.com' && host !== 'lnkd.in') return null;
    const match = url.pathname.match(/\/company\/([^/?#]+)/i);
    if (!match?.[1]) return null;
    const slug = decodeURIComponent(match[1]).replace(/\/+$/, '');
    if (!slug || /^(showcase|school|groups)$/i.test(slug)) return null;
    return `https://www.linkedin.com/company/${slug}`;
  } catch {
    return null;
  }
}

function extractLinkedInFromHtml(html: string): string | undefined {
  const fromSameAs = extractLinkedInFromJsonLd(html);
  if (fromSameAs) return fromSameAs;

  const re =
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/company\/([a-zA-Z0-9._%-]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const normalized = normalizeLinkedInCompanyUrl(`https://www.linkedin.com/company/${match[1]}`);
    if (normalized) return normalized;
  }
  return undefined;
}

function extractLinkedInFromJsonLd(html: string): string | undefined {
  const blocks = parseJsonLdBlocks(html);
  for (const block of blocks) {
    for (const node of flattenJsonLd(block)) {
      if (!node || typeof node !== 'object') continue;
      const obj = node as Record<string, unknown>;
      if (!isOrgType(obj['@type'])) continue;
      const sameAs = obj.sameAs;
      const candidates = Array.isArray(sameAs) ? sameAs : sameAs ? [sameAs] : [];
      for (const c of candidates) {
        if (typeof c !== 'string') continue;
        const normalized = normalizeLinkedInCompanyUrl(c);
        if (normalized) return normalized;
      }
    }
  }
  return undefined;
}

async function lookupLinkedInByCompanyName(companyName: string): Promise<string | undefined> {
  const name = companyName.trim();
  if (name.length < 2) return undefined;

  const query = `${name} site:linkedin.com/company`;
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchHtml(searchUrl);
  if (!html) return undefined;

  const found = extractLinkedInFromHtml(html);
  if (!found) return undefined;

  // Prefer results whose slug vaguely matches the company name tokens
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !['inc', 'llc', 'ltd', 'corp', 'the', 'and'].includes(t));
  if (!tokens.length) return found;

  const re =
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/company\/([a-zA-Z0-9._%-]+)/gi;
  const candidates: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const normalized = normalizeLinkedInCompanyUrl(`https://www.linkedin.com/company/${match[1]}`);
    if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
    if (candidates.length >= 8) break;
  }

  const scored = candidates
    .map((url) => {
      const slug = url.split('/company/')[1]?.toLowerCase() ?? '';
      const score = tokens.reduce((acc, t) => (slug.includes(t) ? acc + 1 : acc), 0);
      return { url, score };
    })
    .sort((a, b) => b.score - a.score);

  if (scored[0] && scored[0].score > 0) return scored[0].url;
  return found;
}

function isPublicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) return false;
  if (
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === '0.0.0.0'
  ) {
    return false;
  }
  return true;
}

async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'CandidPortal/1.0 (company address lookup)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, MAX_HTML_CHARS);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    try {
      blocks.push(JSON.parse(match[1]!));
    } catch {
      // ignore invalid JSON-LD
    }
  }
  return blocks;
}

function flattenJsonLd(node: unknown): unknown[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(flattenJsonLd);
  if (typeof node !== 'object') return [node];
  const obj = node as Record<string, unknown>;
  const graph = obj['@graph'];
  if (Array.isArray(graph)) return graph.flatMap(flattenJsonLd);
  return [obj];
}

function isOrgType(type: unknown): boolean {
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => {
    const s = String(t).toLowerCase();
    return (
      s.includes('organization') ||
      s.includes('localbusiness') ||
      s.includes('corporation') ||
      s.includes('company')
    );
  });
}

function readPostalAddress(addr: unknown): PostalAddress | null {
  if (!addr || typeof addr !== 'object') return null;
  const a = addr as Record<string, unknown>;
  const street = pickString(a.streetAddress, a.street);
  const city = pickString(a.addressLocality, a.city);
  const state = normalizeState(pickString(a.addressRegion, a.state));
  const zip = pickString(a.postalCode, a.zip);
  if (!street && !city && !state && !zip) return null;
  return { street, city, state, zip };
}

function pickString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function normalizeState(raw?: string): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (s.length === 2) return s.toUpperCase();
  return s;
}

function extractFromJsonLd(
  html: string,
): { address?: PostalAddress; companyName?: string; linkedinUrl?: string } {
  const blocks = parseJsonLdBlocks(html);
  let companyName: string | undefined;
  let linkedinUrl: string | undefined;
  for (const block of blocks) {
    for (const node of flattenJsonLd(block)) {
      if (!node || typeof node !== 'object') continue;
      const obj = node as Record<string, unknown>;
      if (!isOrgType(obj['@type'])) continue;

      const name = pickString(obj.name, obj.legalName);
      if (name && !companyName) companyName = name;
      if (!linkedinUrl) {
        const sameAs = obj.sameAs;
        const candidates = Array.isArray(sameAs) ? sameAs : sameAs ? [sameAs] : [];
        for (const c of candidates) {
          if (typeof c !== 'string') continue;
          const normalized = normalizeLinkedInCompanyUrl(c);
          if (normalized) {
            linkedinUrl = normalized;
            break;
          }
        }
      }
      const address = readPostalAddress(obj.address);
      if (address && (address.street || address.city)) {
        return { address, companyName: name ?? companyName, linkedinUrl };
      }
    }
  }
  return { companyName, linkedinUrl };
}

function buildMccCatalogForPrompt(): string {
  const low: string[] = [];
  const mid: string[] = [];
  for (const [code, entry] of Object.entries(MCC_RISK_TABLE)) {
    const line = `${code}: ${entry.label}`;
    if (entry.risk === 'low') low.push(line);
    else if (entry.risk === 'mid') mid.push(line);
  }
  return [
    'LOW RISK (prefer these):',
    ...low,
    '',
    'MID RISK (only if no low-risk code fits):',
    ...mid,
  ].join('\n');
}

function normalizeMccCode(raw?: string): Pick<CompanyAddressLookupResult, 'mccCode' | 'mccLabel' | 'mccRisk'> {
  if (!raw) return {};
  const parsed = parseInt(String(raw).replace(/\D/g, ''), 10);
  if (!parsed) return {};
  const entry = MCC_RISK_TABLE[parsed as keyof typeof MCC_RISK_TABLE];
  if (!entry || entry.risk === 'high') return {};
  const mccRisk = entry.risk as 'low' | 'mid';
  return { mccCode: String(parsed), mccLabel: entry.label, mccRisk };
}

function hasLookupData(result: CompanyAddressLookupResult): boolean {
  return Boolean(
    result.street ||
      result.city ||
      result.state ||
      result.zip ||
      result.industry ||
      result.description ||
      result.mccCode ||
      result.companyName ||
      result.linkedinUrl,
  );
}

async function lookupWithAi(
  origin: string,
  pages: { url: string; text: string }[],
): Promise<CompanyAddressLookupResult | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const corpus = pages
    .map((p) => `--- ${p.url} ---\n${p.text.slice(0, 12_000)}`)
    .join('\n\n')
    .slice(0, 24_000);

  const mccCatalog = buildMccCatalogForPrompt();

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      system:
        'You analyze a company website and extract business profile data. Respond with JSON only, no markdown.',
      messages: [
        {
          role: 'user',
          content: `Website: ${origin}

From this website text, extract:
1. Primary US business mailing address (headquarters or main office)
2. A short industry label (e.g. "Dental / Healthcare", "Freight & Logistics")
3. A very brief company description (1-2 sentences, under 200 characters)
4. The lowest-risk MCC code that fits the merchant's primary card-processing activity
5. LinkedIn company page URL if explicitly present on the site (linkedin.com/company/...)

MCC rules:
- Pick ONLY from the catalog below
- Prefer LOW RISK codes; use MID RISK only when no low-risk code accurately fits
- mccCode must be an exact code from the catalog

MCC catalog:
${mccCatalog}

Return JSON:
{
  "street": string|null,
  "city": string|null,
  "state": string|null,
  "zip": string|null,
  "companyName": string|null,
  "industry": string|null,
  "description": string|null,
  "mccCode": string|null,
  "linkedinUrl": string|null
}

Use 2-letter US state codes. Return null for fields you cannot verify from the text. Do not guess addresses or invent LinkedIn URLs.

${corpus}`,
        },
      ],
    }),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    content?: { type: string; text?: string }[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  logClaudeUsageAsync({
    routeLabel: 'company-address-lookup',
    usage: data.usage,
    maxTokens: 700,
  });
  const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]!) as Record<string, unknown>;
    const street = pickString(parsed.street);
    const city = pickString(parsed.city);
    const state = normalizeState(pickString(parsed.state));
    const zip = pickString(parsed.zip);
    const companyName = pickString(parsed.companyName);
    const industry = pickString(parsed.industry);
    const description = pickString(parsed.description)?.slice(0, 240);
    const mcc = normalizeMccCode(pickString(parsed.mccCode));
    const linkedinUrl = normalizeLinkedInCompanyUrl(pickString(parsed.linkedinUrl) ?? '') ?? undefined;
    const result: CompanyAddressLookupResult = {
      street,
      city,
      state,
      zip,
      companyName,
      industry,
      description,
      linkedinUrl,
      ...mcc,
      source: 'ai',
    };
    return hasLookupData(result) ? result : null;
  } catch {
    return null;
  }
}

export async function lookupCompanyAddressFromWebsite(
  websiteInput: string,
  opts?: { companyName?: string },
): Promise<CompanyAddressLookupResult> {
  const origin = normalizeCompanyWebsite(websiteInput);
  if (!origin) {
    return lookupCompanyProfile({ companyName: opts?.companyName });
  }

  const urls = [origin, ...CONTACT_PATHS.map((p) => `${origin}${p}`)];
  const pages: { url: string; html: string }[] = [];

  for (const url of urls) {
    const html = await fetchHtml(url);
    if (html) pages.push({ url, html });
    if (pages.length >= 3) break;
  }

  if (!pages.length) {
    return lookupCompanyProfile({ companyName: opts?.companyName });
  }

  let linkedinFromSite: string | undefined;
  for (const page of pages) {
    linkedinFromSite = extractLinkedInFromHtml(page.html);
    if (linkedinFromSite) break;
  }

  let structuredResult: CompanyAddressLookupResult | null = null;
  for (const page of pages) {
    const structured = extractFromJsonLd(page.html);
    if (structured.linkedinUrl && !linkedinFromSite) linkedinFromSite = structured.linkedinUrl;
    if (structured.address && (structured.address.street || structured.address.city)) {
      structuredResult = {
        street: structured.address.street,
        city: structured.address.city,
        state: structured.address.state,
        zip: structured.address.zip,
        companyName: structured.companyName,
        linkedinUrl: structured.linkedinUrl ?? linkedinFromSite,
        source: 'structured_data',
      };
      break;
    }
  }

  const textPages = pages.map((p) => ({ url: p.url, text: stripHtml(p.html) }));
  const aiResult = await lookupWithAi(origin, textPages);

  let result: CompanyAddressLookupResult = { source: 'none' };
  if (structuredResult && aiResult) {
    result = {
      street: structuredResult.street ?? aiResult.street,
      city: structuredResult.city ?? aiResult.city,
      state: structuredResult.state ?? aiResult.state,
      zip: structuredResult.zip ?? aiResult.zip,
      companyName: structuredResult.companyName ?? aiResult.companyName,
      industry: aiResult.industry,
      description: aiResult.description,
      mccCode: aiResult.mccCode,
      mccLabel: aiResult.mccLabel,
      mccRisk: aiResult.mccRisk,
      linkedinUrl: linkedinFromSite ?? structuredResult.linkedinUrl ?? aiResult.linkedinUrl,
      source: 'structured_data',
    };
  } else if (aiResult) {
    result = { ...aiResult, linkedinUrl: linkedinFromSite ?? aiResult.linkedinUrl };
  } else if (structuredResult) {
    result = { ...structuredResult, linkedinUrl: linkedinFromSite ?? structuredResult.linkedinUrl };
  } else if (linkedinFromSite) {
    result = { linkedinUrl: linkedinFromSite, source: 'structured_data' };
  }

  if (!result.linkedinUrl) {
    const nameForSearch = opts?.companyName?.trim() || result.companyName;
    if (nameForSearch) {
      result.linkedinUrl = await lookupLinkedInByCompanyName(nameForSearch);
      if (result.linkedinUrl && result.source === 'none') result.source = 'structured_data';
    }
  }

  return hasLookupData(result) ? result : { source: 'none' };
}

/** Look up company profile from website and/or company name (LinkedIn fallback). */
export async function lookupCompanyProfile(opts: {
  website?: string;
  companyName?: string;
}): Promise<CompanyAddressLookupResult> {
  const website = opts.website?.trim();
  const companyName = opts.companyName?.trim();

  if (website) {
    return lookupCompanyAddressFromWebsite(website, { companyName });
  }

  if (!companyName) return { source: 'none' };

  const linkedinUrl = await lookupLinkedInByCompanyName(companyName);
  if (!linkedinUrl) return { source: 'none' };
  return { linkedinUrl, companyName, source: 'structured_data' };
}
