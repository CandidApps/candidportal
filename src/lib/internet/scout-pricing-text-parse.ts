import type { InternetPricingLine, InternetPricingOption } from '@/lib/internet/internet-quote-types';

const newLineId = () => `ipl-${Math.random().toString(36).slice(2, 10)}`;

function parseSpeedPair(label: string): { down?: number; up?: number } {
  const m = label.match(
    /\((\d+(?:\.\d+)?)\s*(?:Mbps|M)?\s*\/\s*(\d+(?:\.\d+)?)\s*(?:Mbps|M)?\)/i,
  );
  if (!m) return {};
  return { down: Number(m[1]), up: Number(m[2]) };
}

function parseMoney(raw: string): number | null {
  const n = Number(raw.replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Comcast / SCOUT rows often run prices together: `Plan (100/100)$365.00$332.00$299.00` */
function parsePricingTableRow(line: string): { label: string; prices: number[] } | null {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.includes('$')) return null;
  if (/^Services\s*M2M/i.test(trimmed)) return null;

  const priceRe = /\$([\d,]+(?:\.\d{2})?)/g;
  const prices: number[] = [];
  let firstPriceAt = -1;
  let match: RegExpExecArray | null;
  while ((match = priceRe.exec(trimmed))) {
    if (firstPriceAt < 0) firstPriceAt = match.index;
    const amount = parseMoney(match[1]!);
    if (amount != null) prices.push(amount);
  }
  if (!prices.length || firstPriceAt <= 0) return null;

  const label = trimmed.slice(0, firstPriceAt).trim();
  if (!label || /^Services/i.test(label)) return null;
  if (/price lock|Promotions/i.test(label)) return null;
  if (!/[A-Za-z]{4,}/.test(label)) return null;
  if (prices.length < 2 && !/\(\d/.test(label)) return null;
  return { label, prices };
}

function pickMonthlyPrice(prices: number[]): number | null {
  if (!prices.length) return null;
  // Prefer 36-month column when present (last of 4 = M2M/12/24/36, or middle of 3 = 24/36/60).
  if (prices.length >= 4) return prices[3] ?? prices[2] ?? prices[0]!;
  if (prices.length === 3) return prices[1] ?? prices[2] ?? prices[0]!;
  return prices[prices.length - 1]!;
}

function inferSectionFromHeader(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.includes('$')) return null;
  if (/^Services\s*M2M/i.test(trimmed)) return null;
  if (
    /\(cont'd\)/i.test(trimmed) ||
    /^(Broadband Internet|Dedicated Internet|Phone Lines|Television|Static IPs|Mobility|Add Ons)/i.test(
      trimmed,
    ) ||
    /Add Ons$/i.test(trimmed)
  ) {
    return trimmed.replace(/\s*\(cont'd\)\s*/gi, ' ').replace(/\s+/g, ' ').trim();
  }
  return null;
}

function collectServiceabilitySummary(text: string): string | undefined {
  const bits: string[] = [];
  const re = /(Comcast Business[^\n]*Serviceability:\s*[^\n]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const bit = m[1]!.replace(/\s+/g, ' ').trim();
    if (!bits.includes(bit)) bits.push(bit);
  }
  if (bits.length) return bits.join(' · ');
  const legacy = text.match(/(Comcast Business|Lumen)[^\n]*Serviceability:\s*([^\n]+)/i);
  if (legacy) return `${legacy[1]}: ${legacy[2]?.trim()}`;
  return undefined;
}

/** Parse SCOUT pricing PDF text (Comcast / Lumen / similar). */
export function parseScoutPricingPdfText(
  text: string,
  opts: { supplierName: string; serviceAddress: string; pdfFilename?: string; pdfStoragePath?: string },
): InternetPricingOption {
  const lines: InternetPricingLine[] = [];
  const normalized = text.replace(/\r/g, '\n');
  const serviceabilitySummary = collectServiceabilitySummary(normalized);

  let currentSection = 'Services';
  for (const rawLine of normalized.split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (/^Pricing Prepared on:/i.test(trimmed)) continue;
    if (/^Comcast Business Pricing For:/i.test(trimmed)) continue;
    if (/^Prepared By:/i.test(trimmed)) continue;
    if (/^Pricing does not include/i.test(trimmed)) continue;
    if (/^Install Details:/i.test(trimmed)) continue;
    if (/^New Customer Promotions:/i.test(trimmed)) continue;
    if (/^Not serviceable|^Likely serviceable/i.test(trimmed)) continue;

    const section = inferSectionFromHeader(trimmed);
    if (section) {
      currentSection = section;
      continue;
    }

    const row = parsePricingTableRow(trimmed);
    if (!row) continue;

    const monthly = pickMonthlyPrice(row.prices);
    const speeds = parseSpeedPair(row.label);
    lines.push({
      id: newLineId(),
      section: currentSection,
      label: row.label,
      downloadMbps: speeds.down ?? null,
      uploadMbps: speeds.up ?? null,
      monthlyPrice: monthly,
      termMonths: 36,
    });
  }

  return {
    id: `ipo-${opts.supplierName.replace(/\W+/g, '-').toLowerCase()}-${Date.now()}`,
    supplierName: opts.supplierName,
    serviceAddress: opts.serviceAddress,
    lines,
    selected: lines.length > 0,
    parsedRawText: normalized.slice(0, 50_000),
    pdfFilename: opts.pdfFilename,
    pdfStoragePath: opts.pdfStoragePath,
    serviceabilitySummary,
  };
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  // Import the parser directly — pdf-parse/index.js runs a debug read of ./test/data/… when loaded as ESM.
  const mod = await import('pdf-parse/lib/pdf-parse.js');
  const pdfParse = (mod.default ?? mod) as (data: Buffer) => Promise<{ text: string }>;
  const result = await pdfParse(buffer);
  return result.text ?? '';
}

export function supplierNameFromPricingFilename(filename: string): string {
  const base = filename.replace(/\.pdf$/i, '').trim();
  const idx = base.lastIndexOf(' - ');
  if (idx > 0) return base.slice(0, idx).trim();
  return base;
}
