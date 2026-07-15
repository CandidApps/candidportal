/** Resolve supplier branding from vendor / service labels for member UI. */

export type SupplierLogoInfo = {
  key: string;
  initials: string;
  domain?: string;
};

const BRANDS: { pattern: RegExp; key: string; domain: string; initials?: string }[] = [
  { pattern: /worldpay|fiserv|vantiv/i, key: 'worldpay', domain: 'worldpay.com', initials: 'WP' },
  { pattern: /ringcentral/i, key: 'ringcentral', domain: 'ringcentral.com', initials: 'RC' },
  { pattern: /comcast|xfinity/i, key: 'comcast', domain: 'comcast.com', initials: 'CB' },
  { pattern: /square/i, key: 'square', domain: 'squareup.com', initials: 'SQ' },
  // Prefer specific UCaaS vendors before Microsoft (Teams is often mentioned in Dialpad scope).
  { pattern: /dialpad/i, key: 'dialpad', domain: 'dialpad.com', initials: 'DP' },
  { pattern: /microsoft|office\s*365|m365/i, key: 'microsoft', domain: 'microsoft.com', initials: 'MS' },
  { pattern: /google\s*workspace|g\s*suite/i, key: 'google', domain: 'google.com', initials: 'GW' },
  { pattern: /vonage/i, key: 'vonage', domain: 'vonage.com', initials: 'VG' },
  { pattern: /stripe/i, key: 'stripe', domain: 'stripe.com', initials: 'ST' },
  { pattern: /clover/i, key: 'clover', domain: 'clover.com', initials: 'CL' },
  { pattern: /elavon/i, key: 'elavon', domain: 'elavon.com', initials: 'EL' },
  { pattern: /heartland/i, key: 'heartland', domain: 'heartlandpaymentsystems.com', initials: 'HT' },
  { pattern: /at&t|att\s/i, key: 'att', domain: 'att.com', initials: 'AT' },
  { pattern: /verizon/i, key: 'verizon', domain: 'verizon.com', initials: 'VZ' },
  { pattern: /spectrum|charter/i, key: 'spectrum', domain: 'spectrum.com', initials: 'SP' },
  { pattern: /cox\b/i, key: 'cox', domain: 'cox.com', initials: 'CX' },
  { pattern: /8x8/i, key: '8x8', domain: '8x8.com', initials: '8x' },
  { pattern: /zoom\s*phone/i, key: 'zoom', domain: 'zoom.us', initials: 'ZM' },
  { pattern: /payment\s*cloud|paymentcloud/i, key: 'paymentcloud', domain: 'paymentcloud.com', initials: 'PC' },
  { pattern: /nuvei/i, key: 'nuvei', domain: 'nuvei.com', initials: 'NV' },
  { pattern: /linked\s*2\s*pay|linked2pay|candid\s*pay/i, key: 'linked2pay', domain: 'linked2pay.com', initials: 'L2' },
  { pattern: /authorize\.?net/i, key: 'authorize', domain: 'authorize.net', initials: 'AN' },
  { pattern: /chase\s*paymentech|paymentech/i, key: 'paymentech', domain: 'chasepaymentech.com', initials: 'CP' },
  { pattern: /first\s*data/i, key: 'firstdata', domain: 'fiserv.com', initials: 'FD' },
  { pattern: /tsys/i, key: 'tsys', domain: 'tsys.com', initials: 'TS' },
  { pattern: /global\s*payments/i, key: 'globalpayments', domain: 'globalpayments.com', initials: 'GP' },
  { pattern: /aws|amazon\s*web/i, key: 'aws', domain: 'aws.amazon.com', initials: 'AW' },
  { pattern: /azure/i, key: 'azure', domain: 'azure.microsoft.com', initials: 'AZ' },
];

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
  if (!brand) return null;
  return {
    key: brand.key,
    initials: brand.initials ?? initialsFromLabel(brand.key),
    domain: brand.domain,
  };
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
        return {
          key: brand.key,
          initials: brand.initials ?? initialsFromLabel(primary),
          domain: brand.domain,
        };
      }
    }
  }

  const haystack = [vendor, serviceName].filter(Boolean).join(' ');
  for (const brand of BRANDS) {
    if (brand.pattern.test(haystack)) {
      return {
        key: brand.key,
        initials: brand.initials ?? initialsFromLabel(haystack),
        domain: brand.domain,
      };
    }
  }

  const label = (vendor || serviceName || '').trim();
  const domain = domainFromWebsite(website);
  return {
    key: domain ? domain.split('.')[0] || 'msp' : 'msp',
    initials: initialsFromLabel(label || 'Service'),
    domain,
  };
}

export function supplierFaviconUrl(domain: string, size = 64): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}
