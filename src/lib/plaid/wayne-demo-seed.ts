import type { TechSpendCategory } from '@/lib/plaid/categorize';

/** Stable demo markers — sync APIs skip items whose item_id / token use these. */
export const WAYNE_DEMO_ITEM_ID = 'demo-wayne-chase-operating';
export const WAYNE_DEMO_TOKEN = 'demo:wayne-enterprises-v1';
export const WAYNE_DEMO_CUSTOMER_EXTERNAL_ID = 'id-8h47mo0y';

export function isDemoPlaidItem(row: {
  item_id?: string | null;
  access_token_enc?: string | null;
}): boolean {
  const itemId = row.item_id?.trim() ?? '';
  const token = row.access_token_enc?.trim() ?? '';
  return itemId.startsWith('demo-') || token.startsWith('demo:');
}

export type WayneDemoTxnSeed = {
  transactionId: string;
  accountId: string;
  date: string;
  amount: number;
  name: string;
  merchantName: string;
  techCategory: TechSpendCategory;
  candidRelated: boolean;
  matchedServiceHint: string | null;
  pending?: boolean;
};

export type WayneDemoAccountSeed = {
  accountId: string;
  name: string;
  officialName: string;
  mask: string;
  type: string;
  subtype: string;
};

type RecurringSpec = {
  key: string;
  merchant: string;
  name: string;
  category: TechSpendCategory;
  /** Base monthly amount (Plaid expense convention: positive = money out). */
  base: number;
  /** Day of month (1–28). */
  day: number;
  candidRelated?: boolean;
  matchedServiceHint?: string | null;
  /** Month-over-month multipliers indexed from oldest → newest (6 months). */
  multipliers?: number[];
};

/**
 * Flashy Wayne Enterprises tech stack for demos:
 * - Payments / CardConnect aligned to My Services (Linked2Pay replacement story)
 * - Phone, internet, cloud, SaaS, security for categorization
 * - Intentional MoM spikes for Action flags
 * - Non-tech noise so Tech-only filter looks real
 */
const RECURRING: RecurringSpec[] = [
  // Matches My Services story (CardConnect → Linked2Pay pending)
  {
    key: 'cardconnect',
    merchant: 'CardConnect / Fiserv',
    name: 'CARDCONNECT MERCHANT FEES',
    category: 'payments',
    base: 4000.7,
    day: 5,
    candidRelated: true,
    matchedServiceHint: 'CardConnect (being replaced by Linked2Pay)',
    multipliers: [0.92, 0.95, 0.98, 1.0, 1.05, 1.22], // spike this month
  },
  {
    key: 'goexceed',
    merchant: 'GOEXCEED',
    name: 'GOEXCEED MOBIL(X) MSP',
    category: 'other_tech',
    base: 500,
    day: 12,
    candidRelated: true,
    matchedServiceHint: 'Mobil(X) — With Candid',
    multipliers: [1, 1, 1, 1, 1, 1],
  },
  // Telecom — big savings opportunity (~25%)
  {
    key: 'ringcentral',
    merchant: 'RingCentral',
    name: 'RINGCENTRAL OFFICE',
    category: 'telecom',
    base: 890,
    day: 8,
    multipliers: [0.95, 0.97, 1.0, 1.02, 1.08, 1.26], // MoM jump
  },
  {
    key: 'verizon',
    merchant: 'Verizon Business',
    name: 'VERIZON WIRELESS BUS',
    category: 'telecom',
    base: 560,
    day: 15,
    multipliers: [1, 1.01, 0.99, 1.02, 1.0, 1.03],
  },
  // Internet
  {
    key: 'comcast',
    merchant: 'Comcast Business',
    name: 'COMCAST BUSINESS FIBER',
    category: 'internet',
    base: 425,
    day: 3,
    multipliers: [1, 1, 1, 1.02, 1.02, 1.15],
  },
  // Cloud — MoM spike
  {
    key: 'aws',
    merchant: 'Amazon Web Services',
    name: 'AWS CLOUD SERVICES',
    category: 'cloud',
    base: 2180,
    day: 2,
    multipliers: [0.88, 0.92, 0.95, 1.05, 1.18, 1.35],
  },
  {
    key: 'cloudflare',
    merchant: 'Cloudflare',
    name: 'CLOUDFLARE INC',
    category: 'cloud',
    base: 180,
    day: 10,
  },
  // SaaS stack
  {
    key: 'm365',
    merchant: 'Microsoft',
    name: 'MICROSOFT 365 E5',
    category: 'saas',
    base: 640,
    day: 6,
  },
  {
    key: 'salesforce',
    merchant: 'Salesforce',
    name: 'SALESFORCE.COM',
    category: 'saas',
    base: 1850,
    day: 11,
    multipliers: [1, 1, 1.05, 1.05, 1.12, 1.12],
  },
  {
    key: 'slack',
    merchant: 'Slack',
    name: 'SLACK TECHNOLOGIES',
    category: 'saas',
    base: 320,
    day: 14,
  },
  {
    key: 'adobe',
    merchant: 'Adobe',
    name: 'ADOBE CREATIVE CLOUD',
    category: 'saas',
    base: 239.88,
    day: 18,
  },
  {
    key: 'atlassian',
    merchant: 'Atlassian',
    name: 'ATLASSIAN JIRA/CONFLUENCE',
    category: 'saas',
    base: 412,
    day: 20,
  },
  // Security
  {
    key: 'crowdstrike',
    merchant: 'CrowdStrike',
    name: 'CROWDSTRIKE FALCON',
    category: 'security',
    base: 780,
    day: 7,
  },
  {
    key: 'okta',
    merchant: 'Okta',
    name: 'OKTA INC',
    category: 'security',
    base: 390,
    day: 16,
  },
  // Other tech
  {
    key: 'openai',
    merchant: 'OpenAI',
    name: 'OPENAI *CHATGPT TEAM',
    category: 'other_tech',
    base: 450,
    day: 9,
    multipliers: [0.6, 0.75, 0.9, 1.0, 1.15, 1.4],
  },
  {
    key: 'github',
    merchant: 'GitHub',
    name: 'GITHUB INC',
    category: 'other_tech',
    base: 88,
    day: 22,
  },
];

const HARDWARE_BURSTS: Array<{ monthsAgo: number; day: number; amount: number; merchant: string; name: string }> = [
  { monthsAgo: 1, day: 4, amount: 4280, merchant: 'CDW', name: 'CDW CORPORATION — LAPTOPS' },
  { monthsAgo: 4, day: 19, amount: 1899, merchant: 'Dell', name: 'DELL BUSINESS PURCHASE' },
];

const NON_TECH: Array<{ monthsAgo: number; day: number; amount: number; merchant: string; name: string }> = [
  { monthsAgo: 0, day: 1, amount: 86.4, merchant: 'Starbucks', name: 'STARBUCKS STORE 4821' },
  { monthsAgo: 0, day: 13, amount: 214.5, merchant: 'Uber', name: 'UBER TRIP' },
  { monthsAgo: 1, day: 7, amount: 612, merchant: 'Delta Air Lines', name: 'DELTA AIR 006' },
  { monthsAgo: 2, day: 21, amount: 148.2, merchant: 'WeWork', name: 'WEWORK MEMBERSHIP' },
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function monthStart(ref: Date, monthsAgo: number): { y: number; m: number } {
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() - monthsAgo);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const WAYNE_DEMO_ACCOUNTS: WayneDemoAccountSeed[] = [
  {
    accountId: 'demo-wayne-checking',
    name: 'Operating Checking',
    officialName: 'Wayne Enterprises Operating Account',
    mask: '1939',
    type: 'depository',
    subtype: 'checking',
  },
  {
    accountId: 'demo-wayne-card',
    name: 'Corporate Amex',
    officialName: 'American Express Business Gold',
    mask: '1007',
    type: 'credit',
    subtype: 'credit card',
  },
];

export function buildWayneDemoTransactions(now = new Date()): WayneDemoTxnSeed[] {
  const txns: WayneDemoTxnSeed[] = [];
  const months = 6;

  for (let monthsAgo = months - 1; monthsAgo >= 0; monthsAgo -= 1) {
    const { y, m } = monthStart(now, monthsAgo);
    const multIdx = months - 1 - monthsAgo;

    for (const spec of RECURRING) {
      const mult = spec.multipliers?.[multIdx] ?? 1;
      const amount = round2(spec.base * mult);
      const accountId = spec.category === 'payments' || spec.category === 'cloud' || amount > 1000
        ? 'demo-wayne-checking'
        : 'demo-wayne-card';
      txns.push({
        transactionId: `demo-wayne-${spec.key}-${y}${pad2(m)}`,
        accountId,
        date: `${y}-${pad2(m)}-${pad2(spec.day)}`,
        amount,
        name: spec.name,
        merchantName: spec.merchant,
        techCategory: spec.category,
        candidRelated: Boolean(spec.candidRelated),
        matchedServiceHint: spec.matchedServiceHint ?? null,
      });
    }
  }

  for (const burst of HARDWARE_BURSTS) {
    const { y, m } = monthStart(now, burst.monthsAgo);
    txns.push({
      transactionId: `demo-wayne-hw-${burst.merchant.toLowerCase()}-${y}${pad2(m)}`,
      accountId: 'demo-wayne-checking',
      date: `${y}-${pad2(m)}-${pad2(burst.day)}`,
      amount: burst.amount,
      name: burst.name,
      merchantName: burst.merchant,
      techCategory: 'hardware_it',
      candidRelated: false,
      matchedServiceHint: null,
    });
  }

  for (const row of NON_TECH) {
    const { y, m } = monthStart(now, row.monthsAgo);
    txns.push({
      transactionId: `demo-wayne-nt-${row.merchant.toLowerCase().replace(/\s+/g, '')}-${y}${pad2(m)}${pad2(row.day)}`,
      accountId: 'demo-wayne-card',
      date: `${y}-${pad2(m)}-${pad2(row.day)}`,
      amount: row.amount,
      name: row.name,
      merchantName: row.merchant,
      techCategory: 'non_tech',
      candidRelated: false,
      matchedServiceHint: null,
    });
  }

  return txns.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Month buckets for flashy MoM chart (oldest → newest). */
export function buildTechSpendMonthBuckets(
  transactions: Array<{ date: string; amount: number; tech_category: string | null }>,
  months = 6,
  now = new Date(),
): Array<{ key: string; label: string; total: number }> {
  const buckets: Array<{ key: string; label: string; total: number }> = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const { y, m } = monthStart(now, i);
    const key = `${y}-${pad2(m)}`;
    const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', {
      month: 'short',
      year: '2-digit',
      timeZone: 'UTC',
    });
    buckets.push({ key, label, total: 0 });
  }
  const index = new Map(buckets.map((b, i) => [b.key, i]));
  for (const t of transactions) {
    if (!t.tech_category || t.tech_category === 'non_tech') continue;
    const key = t.date.slice(0, 7);
    const idx = index.get(key);
    if (idx == null) continue;
    buckets[idx]!.total += Math.abs(Number(t.amount) || 0);
  }
  for (const b of buckets) b.total = round2(b.total);
  return buckets;
}
