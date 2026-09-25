/**
 * CR-0048 — Rewrite Provider Rates product labels for member-facing display.
 * Keeps partner-commission jargon out of member UI while preserving originals in source_product_name.
 */

export type MemberProductRewrite = {
  memberName: string;
  /** When true, product cannot be shown cleanly to members. */
  hideFromMemberView: boolean;
  reason?: string;
};

const HIDE_EXACT = new Set(
  [
    'white label',
    'wholesale / white label override referal',
    'wholesale / white label override referral',
    'partner assisted',
    'partner tlm',
    'referal partner commissions',
    'referral partner commissions',
    'ntt affiliate/partner product',
    'monthly residual commissionable revenue',
  ].map((s) => s.toLowerCase()),
);

/** Phrases that are partner-ops only — strip or hide. */
const STRIP_PHRASES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bpartner\s+generated(?:\s+only)?\b/gi, replacement: '' },
  { pattern: /\bpartner\s+facing\b/gi, replacement: '' },
  { pattern: /\bpartner\s+facilita\w*\b/gi, replacement: '' },
  { pattern: /\bpartner\s+teaming\b/gi, replacement: '' },
  { pattern: /\bpartner\s+assisted\b/gi, replacement: '' },
  { pattern: /\btfb\s+direct\s+led\b/gi, replacement: '' },
  { pattern: /\bdirect\s+led\b/gi, replacement: '' },
  { pattern: /\bwhite[- ]?label\b/gi, replacement: '' },
  { pattern: /\bchannel\s+partner\s+program(?:\s+\([^)]*\))?\s*—?\s*/gi, replacement: '' },
  { pattern: /\bqualified\s+vendor\s+partner\s+services\b/gi, replacement: 'Managed services' },
  {
    pattern:
      /\bactivations\s+earn\s+residual\s+commissions?\s+for\s+up\s+to\s+\d+\s+months?\b[^,]*/gi,
    replacement: '',
  },
  {
    pattern: /\bresidual\s+commissions?\s+for\s+up\s+to\s+\d+\s+months?\b/gi,
    replacement: '',
  },
  { pattern: /\(\s*\d+x\s+total\s+mrc\s*\)/gi, replacement: '' },
  { pattern: /\b\d+x\s+total\s+mrc\b/gi, replacement: '' },
  { pattern: /\b\d+x\s+mrc\b/gi, replacement: '' },
  { pattern: /\*\s*\d+%\s+residual\b[^,]*/gi, replacement: '' },
  {
    pattern: /\(vas\s*=\s*value\s+added\s+solutions[^)]*\)/gi,
    replacement: '(value-added solutions)',
  },
  { pattern: /\bone[- ]time\s+payment\s+of\s+tcv\b/gi, replacement: 'one-time (total contract value)' },
  { pattern: /\bone[- ]time\s+payment\b/gi, replacement: 'one-time' },
  { pattern: /\bONE-?\s*TIME\s+PAYMENT\b/g, replacement: 'one-time' },
];

function tidy(name: string): string {
  return name
    .replace(/\s*[|&/·]+\s*$/g, '')
    .replace(/^\s*[|&/·,-]+\s*/g, '')
    .replace(/\s*&\s*-\s*/g, ' & ')
    .replace(/,\s*-\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,;:])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+-\s+-/g, ' — ')
    .replace(/\s*—\s*—/g, ' — ')
    .trim()
    .replace(/^[\s\-–—,&]+|[\s\-–—,&]+$/g, '')
    .trim();
}

function stillHasPartnerJargon(name: string): boolean {
  return /\b(partner\s+(generated|facing|teaming|assisted|facilita\w*)|tfb\s+direct|white[- ]?label|residual\s+commissionable|affiliate\/partner)\b/i.test(
    name,
  );
}

/**
 * Produce a member-safe product label. Hide when the row is partner-ops only
 * or cannot be cleaned into a sensible product name.
 */
export function rewriteMemberProductName(sourceName: string): MemberProductRewrite {
  const raw = (sourceName || '').trim();
  if (!raw) {
    return { memberName: '', hideFromMemberView: true, reason: 'empty' };
  }

  const lower = raw.toLowerCase().trim();
  if (HIDE_EXACT.has(lower) || /^white\s*label$/i.test(raw)) {
    return { memberName: raw, hideFromMemberView: true, reason: 'partner-only label' };
  }
  if (/white\s*label/i.test(raw) && raw.length < 80) {
    return { memberName: raw, hideFromMemberView: true, reason: 'white-label / wholesale override' };
  }
  if (/^partner\s+/i.test(raw) && raw.length < 40) {
    return { memberName: raw, hideFromMemberView: true, reason: 'partner-ops stub' };
  }

  let next = raw;
  for (const { pattern, replacement } of STRIP_PHRASES) {
    next = next.replace(pattern, replacement);
  }
  next = tidy(next);

  // Specific friendly rewrites after stripping
  const specific: Array<[RegExp, string]> = [
    [/^eligible rate plan\b/i, 'Eligible mobile rate plan'],
    [/^hsi rate plan\b/i, 'High-speed internet (HSI) rate plan'],
    [/^ans opportunity\b/i, 'Advanced network solutions (ANS)'],
    [/^control center activation/i, 'Control Center activation'],
    [/^hardware\/mdm/i, 'Hardware / device management (MDM)'],
    [/^vas\s*[–—-]/i, 'Value-added solutions —'],
    [/^or\s+/i, ''],
  ];
  for (const [re, rep] of specific) {
    next = next.replace(re, rep);
  }
  next = tidy(next);

  if (!next || next.length < 4) {
    return { memberName: raw, hideFromMemberView: true, reason: 'rewrote to empty/too short' };
  }
  if (stillHasPartnerJargon(next)) {
    return { memberName: next, hideFromMemberView: true, reason: 'residual partner jargon' };
  }

  // Title-case cleanup not needed — keep natural casing from source after strip
  return { memberName: next, hideFromMemberView: false };
}

export type ProviderMergeSpec = {
  canonicalSlug: string;
  canonicalName: string;
  sourceSlugs: string[];
  /** Slugs that must stay separate even if name-similar. */
  keepSeparateSlugs?: string[];
};

/** High-confidence merges (partner DB label duplicates). */
export const PROVIDER_RATE_MERGES: ProviderMergeSpec[] = [
  {
    canonicalSlug: 't-mobile',
    canonicalName: 'T-Mobile',
    sourceSlugs: ['wireless-t-mobile', 't-mobile-sprint'],
    keepSeparateSlugs: ['t-mobile-powered-by-hyperion'],
  },
  {
    canonicalSlug: 'verizon-wireless',
    canonicalName: 'Verizon Wireless',
    sourceSlugs: ['wireless-verizon', 'verizon-wireless'],
  },
  {
    canonicalSlug: 'mettel',
    canonicalName: 'MetTel',
    sourceSlugs: ['wireless-mettel', 'mettel'],
  },
];

export function memberProviderDisplayName(row: {
  name: string;
  member_name?: string | null;
}): string {
  const member = row.member_name?.trim();
  return member || row.name;
}

export function isProviderVisibleToMembers(row: {
  customer_facing?: boolean | null;
  merged_into_slug?: string | null;
}): boolean {
  if (row.merged_into_slug) return false;
  return row.customer_facing !== false;
}

export function isProductVisibleToMembers(row: {
  hide_from_member_view?: boolean | null;
}): boolean {
  return row.hide_from_member_view !== true;
}
