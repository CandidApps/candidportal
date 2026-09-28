/** Heuristics for spotting duplicate deals (same account or same company split across accounts). */

export type DuplicateConfidence = 'High' | 'Medium' | 'Low';

export type DuplicateCandidate = {
  id: string;
  customerId: string;
  company: string;
  provider: string;
  product?: string | null;
  paySource?: string | null;
  monthly?: number | null;
  dealUid?: string | null;
  status?: string | null;
  /** Service text (e.g. "UCaaS"); compared when product is blank. */
  service?: string | null;
  locationId?: string | null;
};

export type DuplicatePair<T extends DuplicateCandidate = DuplicateCandidate> = {
  a: T;
  b: T;
  crossAccount: boolean;
  score: number;
  confidence: DuplicateConfidence;
  reasons: string[];
};

const PROVIDER_ALIASES: Record<string, string> = {
  xfinity: 'comcast',
  comcastbusiness: 'comcast',
  charter: 'spectrum',
  centurylink: 'lumen',
  level3: 'lumen',
  vbc: 'vonage',
  vonagebusiness: 'vonage',
  gotoconnect: 'goto',
  jive: 'goto',
  cardpointe: 'clover',
  cardconnect: 'clover',
  att: 'att',
  atandt: 'att',
};

const COMPANY_NOISE = new Set(['inc', 'llc', 'ltd', 'corp', 'co', 'pc', 'pllc', 'md', 'sc', 'the', 'dba', 'company']);

function compact(s: string | null | undefined): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

/** "PayJunction — Payment Processing" and "Payjunction" both → "payjunction". */
export function providerBaseKey(provider: string | null | undefined): string {
  const raw = String(provider ?? '').split(/\s[—–-]\s/)[0] ?? '';
  const key = compact(raw);
  if (!key || key === 'none' || key === 'noprovider') return '';
  return PROVIDER_ALIASES[key] ?? key;
}

export function companyKey(company: string | null | undefined): string {
  return String(company ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && !COMPANY_NOISE.has(t))
    .join(' ');
}

function blank(v: string | null | undefined): boolean {
  const s = String(v ?? '').trim();
  return !s || s === '—';
}

function inactive(status: string | null | undefined): boolean {
  return /expired|cancel|closed|lost|inactive/i.test(String(status ?? ''));
}

type UidKind = 'supplier' | 'manual' | 'unknown';

/** Supplier-issued deal numbers are numeric; app-created deals use UUIDs or "candid-" ids. */
function uidKind(uid: string | null | undefined): UidKind {
  const s = String(uid ?? '').trim();
  if (!s) return 'unknown';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) || /^candid[-_]/i.test(s)) return 'manual';
  if (/^\d[\d.,eE+]*$/.test(s)) return 'supplier';
  return 'unknown';
}

/** Product, else service, else the text after "Provider — ". */
function offeringKey(c: DuplicateCandidate): string {
  const fromProvider = String(c.provider ?? '').split(/\s[—–-]\s/).slice(1).join(' ');
  return compact(c.product) || compact(c.service) || compact(fromProvider);
}

export function scoreDuplicatePair<T extends DuplicateCandidate>(a: T, b: T): DuplicatePair<T> | null {
  const provider = providerBaseKey(a.provider);
  if (!provider || provider !== providerBaseKey(b.provider)) return null;
  const crossAccount = a.customerId !== b.customerId;
  if (crossAccount && (!companyKey(a.company) || companyKey(a.company) !== companyKey(b.company))) return null;

  const reasons: string[] = [crossAccount ? 'Same company name on two accounts' : 'Same account', 'Same provider'];
  let score = crossAccount ? 35 : 45;

  const sameUid = !blank(a.dealUid) && compact(a.dealUid) === compact(b.dealUid);
  if (sameUid) {
    score += 45;
    reasons.push('Same deal ID');
  } else {
    const kindA = uidKind(a.dealUid);
    const kindB = uidKind(b.dealUid);
    if (kindA === 'supplier' && kindB === 'supplier') {
      score -= 40;
      reasons.push('Different supplier deal numbers');
    } else if ((kindA === 'supplier' && kindB === 'manual') || (kindA === 'manual' && kindB === 'supplier')) {
      score += 15;
      reasons.push('Supplier-imported deal plus a manually created deal');
    }
  }

  const offerA = offeringKey(a);
  const offerB = offeringKey(b);
  if (offerA && offerB) {
    if (offerA === offerB || offerA.includes(offerB) || offerB.includes(offerA)) {
      score += 15;
      reasons.push('Same product/service');
    } else {
      score -= 25;
      reasons.push('Different products/services');
    }
  }

  const locA = compact(a.locationId);
  const locB = compact(b.locationId);
  if (locA && locB) {
    if (locA === locB) {
      score += 5;
      reasons.push('Same location');
    } else {
      score -= 15;
      reasons.push('Different locations');
    }
  }

  const payA = compact(a.paySource);
  const payB = compact(b.paySource);
  if (payA && payB && payA !== payB) {
    score -= 10;
    reasons.push('Different pay sources');
  }

  const mA = a.monthly != null && Number.isFinite(a.monthly) ? Number(a.monthly) : 0;
  const mB = b.monthly != null && Number.isFinite(b.monthly) ? Number(b.monthly) : 0;
  if (mA && mB) {
    if (Math.abs(mA - mB) < 0.01) {
      score += 10;
      reasons.push('Same monthly amount');
    } else {
      score -= 15;
      reasons.push('Different monthly amounts');
    }
  }

  if (inactive(a.status) !== inactive(b.status)) {
    score -= 10;
    reasons.push('One deal is expired/cancelled');
  }

  const confidence: DuplicateConfidence = score >= 75 ? 'High' : score >= 55 ? 'Medium' : 'Low';
  return { a, b, crossAccount, score, confidence, reasons };
}

/** Pairs scoring at least `minScore`, best first. Cross-account pairs only when `crossAccount` is set. */
export function findLikelyDuplicatePairs<T extends DuplicateCandidate>(
  items: T[],
  opts: { crossAccount?: boolean; minScore?: number } = {},
): DuplicatePair<T>[] {
  const minScore = opts.minScore ?? 35;
  const byProvider = new Map<string, T[]>();
  for (const item of items) {
    const key = providerBaseKey(item.provider);
    if (!key) continue;
    const list = byProvider.get(key) ?? [];
    list.push(item);
    byProvider.set(key, list);
  }
  const pairs: DuplicatePair<T>[] = [];
  for (const group of byProvider.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        if (a.customerId !== b.customerId && !opts.crossAccount) continue;
        const pair = scoreDuplicatePair(a, b);
        if (pair && pair.score >= minScore) pairs.push(pair);
      }
    }
  }
  return pairs.sort((x, y) => y.score - x.score);
}
