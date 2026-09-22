/** Resolve supplier branding from vendor / service labels for member UI. */

export type SupplierLogoInfo = {
  key: string;
  initials: string;
  domain?: string;
  /** Prefer a first-party static icon under /brand-icons when present. */
  localIconUrl?: string;
};

/**
 * Known brands → logo key + domain for favicon lookup.
 * Keep specific vendors (Dialpad, RingCentral, …) before broad ones (Microsoft).
 */
const BRANDS: { pattern: RegExp; key: string; domain: string; initials?: string }[] = [
  { pattern: /worldpay|fiserv|vantiv|card\s*connect|cardpointe/i, key: 'worldpay', domain: 'worldpay.com', initials: 'WP' },
  { pattern: /ringcentral/i, key: 'ringcentral', domain: 'ringcentral.com', initials: 'RC' },
  { pattern: /comcast|xfinity/i, key: 'comcast', domain: 'business.comcast.com', initials: 'CB' },
  { pattern: /square(?!space|enix)/i, key: 'square', domain: 'squareup.com', initials: 'SQ' },
  { pattern: /dialpad/i, key: 'dialpad', domain: 'dialpad.com', initials: 'DP' },
  { pattern: /nextiva/i, key: 'nextiva', domain: 'nextiva.com', initials: 'NX' },
  { pattern: /goto|logmein/i, key: 'goto', domain: 'goto.com', initials: 'GT' },
  { pattern: /microsoft|office\s*365|m365/i, key: 'microsoft', domain: 'microsoft.com', initials: 'MS' },
  { pattern: /google\s*workspace|g\s*suite|\bgoogle\b/i, key: 'google', domain: 'google.com', initials: 'GW' },
  { pattern: /vonage/i, key: 'vonage', domain: 'vonage.com', initials: 'VG' },
  { pattern: /stripe/i, key: 'stripe', domain: 'stripe.com', initials: 'ST' },
  { pattern: /clover/i, key: 'clover', domain: 'clover.com', initials: 'CL' },
  { pattern: /elavon/i, key: 'elavon', domain: 'elavon.com', initials: 'EL' },
  { pattern: /heartland/i, key: 'heartland', domain: 'heartland.us', initials: 'HT' },
  { pattern: /at&t|\batt\b/i, key: 'att', domain: 'att.com', initials: 'AT' },
  { pattern: /verizon/i, key: 'verizon', domain: 'verizon.com', initials: 'VZ' },
  { pattern: /spectrum|charter/i, key: 'spectrum', domain: 'spectrum.com', initials: 'SP' },
  { pattern: /\bcox\b/i, key: 'cox', domain: 'cox.com', initials: 'CX' },
  { pattern: /8\s*x\s*8|8x8/i, key: '8x8', domain: '8x8.com', initials: '8x' },
  { pattern: /zoom/i, key: 'zoom', domain: 'zoom.us', initials: 'ZM' },
  { pattern: /3\s*cx|3cx/i, key: '3cx', domain: '3cx.com', initials: '3C' },
  { pattern: /payment\s*cloud|paymentcloud/i, key: 'paymentcloud', domain: 'paymentcloud.com', initials: 'PC' },
  { pattern: /nuvei/i, key: 'nuvei', domain: 'nuvei.com', initials: 'NV' },
  { pattern: /check\s*commerce|checkcommerce/i, key: 'checkcommerce', domain: 'checkcommerce.com', initials: 'CC' },
  { pattern: /linked\s*2\s*pay|linked2pay|candid\s*pay/i, key: 'linked2pay', domain: 'linked2pay.com', initials: 'L2' },
  { pattern: /authorize\.?net/i, key: 'authorize', domain: 'authorize.net', initials: 'AN' },
  { pattern: /chase\s*paymentech|paymentech/i, key: 'paymentech', domain: 'chase.com', initials: 'CP' },
  { pattern: /first\s*data/i, key: 'firstdata', domain: 'fiserv.com', initials: 'FD' },
  { pattern: /\btsys\b/i, key: 'tsys', domain: 'tsys.com', initials: 'TS' },
  { pattern: /global\s*payments/i, key: 'globalpayments', domain: 'globalpayments.com', initials: 'GP' },
  { pattern: /aws|amazon\s*web|\bamazon\b/i, key: 'aws', domain: 'aws.amazon.com', initials: 'AW' },
  { pattern: /azure/i, key: 'azure', domain: 'azure.microsoft.com', initials: 'AZ' },
  { pattern: /adobe/i, key: 'adobe', domain: 'adobe.com', initials: 'AD' },
  { pattern: /lumen|centurylink/i, key: 'lumen', domain: 'lumen.com', initials: 'LU' },
  { pattern: /t[\s-]?mobile/i, key: 'tmobile', domain: 't-mobile.com', initials: 'TM' },
  { pattern: /frontier/i, key: 'frontier', domain: 'frontier.com', initials: 'FR' },
  { pattern: /windstream/i, key: 'windstream', domain: 'windstreamenterprise.com', initials: 'WS' },
  { pattern: /airespring/i, key: 'airespring', domain: 'airespring.com', initials: 'AS' },
  { pattern: /app\s*direct/i, key: 'appdirect', domain: 'appdirect.com', initials: 'AP' },
  { pattern: /mettel/i, key: 'mettel', domain: 'mettel.net', initials: 'MT' },
  { pattern: /metronet/i, key: 'metronet', domain: 'metronet.com', initials: 'MN' },
  { pattern: /granite/i, key: 'granite', domain: 'granitenet.com', initials: 'GR' },
  { pattern: /\bnitel\b/i, key: 'nitel', domain: 'nitelusa.com', initials: 'NT' },
  { pattern: /net2phone/i, key: 'net2phone', domain: 'net2phone.com', initials: 'N2' },
  { pattern: /momentum\s*telecom/i, key: 'momentum', domain: 'momentumtelecom.com', initials: 'MO' },
  { pattern: /spectrotel/i, key: 'spectrotel', domain: 'spectrotel.com', initials: 'ST' },
  { pattern: /bulls?\s*eye/i, key: 'bullseye', domain: 'bullseyetelecom.com', initials: 'BE' },
  { pattern: /new\s*horizon|\bnhc\b/i, key: 'nhc', domain: 'nhc.com', initials: 'NH' },
  { pattern: /telarus/i, key: 'telarus', domain: 'telarus.com', initials: 'TE' },
  { pattern: /intelisys|intelysys/i, key: 'intelisys', domain: 'intelisys.com', initials: 'IN' },
  { pattern: /sandler/i, key: 'sandler', domain: 'sandlerpartners.com', initials: 'SA' },
  { pattern: /priority/i, key: 'priority', domain: 'prioritycommerce.com', initials: 'PR' },
  { pattern: /twilio/i, key: 'twilio', domain: 'twilio.com', initials: 'TW' },
  { pattern: /\bcisco\b|meraki/i, key: 'cisco', domain: 'cisco.com', initials: 'CI' },
  { pattern: /paypal/i, key: 'paypal', domain: 'paypal.com', initials: 'PP' },
  { pattern: /teksystems|tek\s*systems/i, key: 'teksystems', domain: 'teksystems.com', initials: 'TK' },
];

/** Keys that have a PNG under public/brand-icons/stratum/ (from Stratum subset). */
const LOCAL_STRATUM_KEYS: Record<string, string> = {
  '3cx': '3cx.png',
  adobe: 'adobe.png',
  amazon: 'amazon.png',
  aws: 'aws.png',
  cisco: 'cisco.png',
  google: 'google.png',
  goto: 'goto.png',
  logmein: 'logmein.png',
  microsoft: 'microsoft.png',
  paypal: 'paypal.png',
  square: 'square.png',
  stripe: 'stripe.png',
  tmobile: 'tmobile.png',
  twilio: 'twilio.png',
  zoom: 'zoom.png',
};

function initialsFromLabel(label: string): string {
  const cleaned = label.replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
  if (!cleaned) return 'SV';
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]![0] ?? ''}${words[1]![0] ?? ''}`.toUpperCase();
  }
  const w = words[0] ?? '';
  return w.slice(0, 2).toUpperCase() || 'SV';
}

function localIconForKey(key: string): string | undefined {
  const file = LOCAL_STRATUM_KEYS[key];
  return file ? `/brand-icons/stratum/${file}` : undefined;
}

function brandInfo(
  key: string,
  domain: string,
  initials: string | undefined,
  label: string,
): SupplierLogoInfo {
  return {
    key,
    initials: initials ?? initialsFromLabel(label || key),
    domain,
    localIconUrl: localIconForKey(key),
  };
}

/** Extract a logo-friendly hostname from a website URL or bare domain. */
export function domainFromWebsite(website?: string | null): string | undefined {
  const raw = website?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const host = url.hostname.replace(/^www\./i, '').trim();
    return host || undefined;
  } catch {
    const cleaned = raw
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split(/[/?#]/)[0]
      ?.trim();
    return cleaned || undefined;
  }
}

export function resolveSupplierLogoByKey(key?: string | null): SupplierLogoInfo | null {
  const k = key?.trim().toLowerCase();
  if (!k || k === 'msp' || k === 'external') return null;
  const brand = BRANDS.find((b) => b.key === k);
  if (brand) {
    return brandInfo(brand.key, brand.domain, brand.initials, brand.key);
  }
  const local = localIconForKey(k);
  if (local) {
    return { key: k, initials: initialsFromLabel(k), localIconUrl: local };
  }
  return null;
}

export function resolveSupplierLogo(
  vendor?: string | null,
  serviceName?: string | null,
  website?: string | null,
): SupplierLogoInfo {
  // Match primary vendor identity first so description text (e.g. "Microsoft Teams
  // integration") cannot override Dialpad / RingCentral branding.
  const primary = (vendor || '').trim();
  if (primary) {
    for (const brand of BRANDS) {
      if (brand.pattern.test(primary)) {
        return brandInfo(brand.key, brand.domain, brand.initials, primary);
      }
    }
  }

  const haystack = [vendor, serviceName].filter(Boolean).join(' ');
  for (const brand of BRANDS) {
    if (brand.pattern.test(haystack)) {
      return brandInfo(brand.key, brand.domain, brand.initials, haystack);
    }
  }

  const label = (vendor || serviceName || '').trim();
  const domain = domainFromWebsite(website);
  const key = domain ? domain.split('.')[0] || 'msp' : 'msp';
  return {
    key,
    initials: initialsFromLabel(label || 'Service'),
    domain,
    localIconUrl: localIconForKey(key),
  };
}

/** Google favicon service — works without API keys; size up to 128. */
export function supplierFaviconUrl(domain: string, size = 128): string {
  const sz = Math.min(128, Math.max(16, size));
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${sz}`;
}
