import type {
  InternetScoutLookup,
  InternetScoutProviderCard,
  InternetScoutProviderRow,
  InternetScoutServiceabilityLine,
} from '@/lib/internet/internet-quote-types';
import { SCOUT_LOOKUP_SUBJECT_PREFIX } from '@/lib/internet/internet-quote-config';

function colorFromStyle(style: string | undefined): InternetScoutServiceabilityLine['statusColor'] {
  if (!style) return 'other';
  if (/rgb\(0,\s*128|rgb\(0,\s*176|green/i.test(style)) return 'green';
  if (/rgb\(246,\s*186,\s*16\)|yellow/i.test(style)) return 'yellow';
  if (/rgb\(255,\s*0,\s*19\)|red/i.test(style)) return 'red';
  return 'other';
}

function isQuotableLine(line: InternetScoutServiceabilityLine): boolean {
  const t = `${line.statusText} ${line.statusColor}`.toLowerCase();
  if (line.statusColor === 'green' || line.statusColor === 'yellow') return true;
  if (/\bgreen\b|\byellow\b/.test(t)) return true;
  if (/\bred\b|off-net|not serviceable|no response/.test(t)) return false;
  return false;
}

/** Parse a SCOUT Lookup HTML email body (mnorman@sandlerpartners.com). */
export function parseScoutLookupEmailHtml(html: string, subject?: string): InternetScoutLookup {
  const subj = subject?.trim() ?? '';
  const serviceAddressFromSubject = subj.startsWith(SCOUT_LOOKUP_SUBJECT_PREFIX)
    ? subj.slice(SCOUT_LOOKUP_SUBJECT_PREFIX.length).trim()
    : '';

  const addressMatch =
    html.match(/scout-address--searched-for[^>]*>([^<]+)</i) ??
    html.match(/Showing Results For:[\s\S]*?<a[^>]*>([^<]+)</i);
  const serviceAddress =
    (addressMatch?.[1] ?? '').replace(/\s+/g, ' ').trim() || serviceAddressFromSubject;

  const providerCards: InternetScoutProviderCard[] = [];
  // Split on card <td> only — CSS in the email also references this class name.
  const cardBlocks = html.split(/<td[^>]*serviceability-cards-shadow-wrap/gi).slice(1);
  for (let i = 0; i < cardBlocks.length; i++) {
    const block = cardBlocks[i]!;
    const roleMatch = block.match(/<strong[^>]*>([^<:]+):<\/strong>/i);
    const roleLabel = roleMatch?.[1]?.trim() ?? 'Provider';
    const logoMatch = block.match(/<img[^>]*alt="([^"]+)"[^>]*src="([^"]+)"/i);
    const providerName = logoMatch?.[1]?.trim() ?? roleLabel;
    const logoUrl = logoMatch?.[2];

    const lines: InternetScoutServiceabilityLine[] = [];
    const lineRegex =
      /<strong>([\s\S]*?):\s*<\/strong>\s*<span[^>]*style="[^"]*color:\s*([^";]+)[^"]*"[^>]*>([^<]*)<\/span>/gi;
    let m: RegExpExecArray | null;
    while ((m = lineRegex.exec(block))) {
      const label = m[1]!.replace(/\s+/g, ' ').trim();
      const statusText = m[3]!.trim();
      const statusColor = colorFromStyle(m[2]);
      const slice = block.slice(m.index, m.index + 1200);
      const descMatch =
        slice.match(/overflow:\s*hidden[^>]*>\s*<span>([^<]{4,500})<\/span>/i) ??
        slice.match(/cable-details__description[^>]*>([\s\S]*?)<\/div>/i);
      const description = descMatch?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      lines.push({
        label,
        statusText,
        statusColor,
        description: description || undefined,
      });
    }

    const pricingUrlMatch = block.match(/href="(https:\/\/www\.sandlerportal\.com\/scout\/pricing[^"]+)"/i);
    const quotable = lines.some(isQuotableLine);

    if (lines.length || logoMatch) {
      providerCards.push({
        id: `scout-card-${i}-${providerName.replace(/\W+/g, '-').toLowerCase()}`,
        roleLabel,
        providerName,
        logoUrl,
        lines,
        scoutPricingUrl: pricingUrlMatch?.[1]?.replace(/&amp;/g, '&'),
        quotable,
      });
    }
  }

  const availableProviders: InternetScoutProviderRow[] = [];
  const tableSection = html.match(/Available Providers[\s\S]*?<table[\s\S]*?<\/table>/i)?.[0] ?? '';
  const rowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>[\s\S]*?>([^<]+)<[\s\S]*?<td[^>]*>[\s\S]*?>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/gi;
  let row: RegExpExecArray | null;
  while ((row = rowRegex.exec(tableSection))) {
    const name = row[1]!.replace(/<[^>]+>/g, '').trim();
    if (!name || name.toLowerCase() === 'provider') continue;
    const accessType = row[2]!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const distance = row[3]!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    availableProviders.push({ name, accessType, distance });
  }

  return {
    subject: subj || `${SCOUT_LOOKUP_SUBJECT_PREFIX}${serviceAddress}`,
    serviceAddress,
    receivedAt: new Date().toISOString(),
    providerCards,
    availableProviders,
    rawHtml: html.length > 200_000 ? html.slice(0, 200_000) : html,
  };
}

export function isScoutLookupSubject(subject: string): boolean {
  return subject.trim().startsWith(SCOUT_LOOKUP_SUBJECT_PREFIX);
}

export function isScoutLookupFromAddress(from: string): boolean {
  return /mnorman@sandlerpartners\.com/i.test(from);
}
