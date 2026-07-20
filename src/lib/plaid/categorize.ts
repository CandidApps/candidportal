export type TechSpendCategory =
  | 'telecom'
  | 'internet'
  | 'saas'
  | 'cloud'
  | 'payments'
  | 'utilities'
  | 'hardware_it'
  | 'security'
  | 'other_tech'
  | 'non_tech';

type Rule = {
  category: TechSpendCategory;
  pattern: RegExp;
  candidHint?: string;
};

/** Merchant / description heuristics for tech & utility spend monitoring. */
const RULES: Rule[] = [
  {
    category: 'telecom',
    pattern:
      /\b(dialpad|ringcentral|vonage|8x8|zoom\s*phone|nextiva|goto\s*connect|microsoft\s*teams\s*phone|intermedia|jive|mitel|grasshopper|ooma|phone\.com|openphone|aircall|dialer)\b/i,
    candidHint: 'UCaaS / Phone',
  },
  {
    category: 'telecom',
    pattern: /\b(phone\s*bill|wireless|mobile\s*phone|business\s*phone|voip|ucaas|pbx)\b/i,
    candidHint: 'UCaaS / Phone',
  },
  { category: 'telecom', pattern: /\b(twilio|bandwidth\.com|sinch|messagebird)\b/i, candidHint: 'Communications' },
  {
    category: 'internet',
    pattern:
      /\b(comcast|xfinity|spectrum|charter|cox\s*business|at&?t|verizon|lumen|centurylink|frontier|windstream|t-mobile\s*business|metronet|fiber)\b/i,
    candidHint: 'Internet',
  },
  {
    category: 'saas',
    pattern:
      /\b(microsoft|office\s*365|o365|google\s*workspace|gsuite|adobe|salesforce|hubspot|slack|zoom|dropbox|box\.com|notion|atlassian|jira|confluence|docusign|quickbooks|intuit)\b/i,
    candidHint: 'Software',
  },
  {
    category: 'cloud',
    pattern: /\b(amazon\s*web\s*services|\baws\b|azure|google\s*cloud|\bgcp\b|digitalocean|cloudflare|heroku|vercel|netlify)\b/i,
    candidHint: 'Cloud',
  },
  {
    category: 'payments',
    pattern:
      /\b(square|stripe|clover|toast|shopify\s*payments|payjunction|paymentcloud|nuvei|worldpay|fiserv|elavon|authorize\.?net|linked2pay|hyfin|checkcommerce)\b/i,
    candidHint: 'Merchant processing',
  },
  {
    category: 'utilities',
    pattern: /\b(electric|power\s*co|pge|pg&e|duke\s*energy|dominion|xcel\s*energy|water\s*dept|utility|utilities|gas\s*company)\b/i,
    candidHint: 'Utilities',
  },
  {
    category: 'hardware_it',
    pattern: /\b(apple\.com\/bill|best\s*buy|cdw|connection|shI|dell|lenovo|hp\.com|amazon\.com)\b/i,
    candidHint: 'IT hardware',
  },
  {
    category: 'security',
    pattern:
      /\b(okta|crowdstrike|sentinelone|norton|symantec|knowbe4|1password|lastpass|duo\s*security|palo\s*alto|fortinet|sonicwall)\b/i,
    candidHint: 'Security',
  },
  {
    category: 'other_tech',
    pattern: /\b(godaddy|namecheap|domains?|hosting|webflow|wix|squarespace|github|gitlab|bitbucket|openai|anthropic|chatgpt)\b/i,
    candidHint: 'Technology',
  },
];

const PFC_MAP: Record<string, TechSpendCategory> = {
  TELECOMMUNICATION_SERVICES: 'telecom',
  INTERNET_SERVICES: 'internet',
  SOFTWARE: 'saas',
  DIGITAL_PURCHASE: 'saas',
  CLOUD_STORAGE: 'cloud',
  COMPUTERS_AND_ELECTRONICS: 'hardware_it',
  UTILITIES: 'utilities',
};

export function classifyTechSpend(input: {
  name?: string | null;
  merchantName?: string | null;
  plaidCategory?: string[] | null;
  personalFinanceCategory?: { primary?: string; detailed?: string } | null;
}): { techCategory: TechSpendCategory; candidHint: string | null } {
  const blob = [input.merchantName, input.name, ...(input.plaidCategory ?? [])]
    .filter(Boolean)
    .join(' ');

  for (const rule of RULES) {
    if (rule.pattern.test(blob)) {
      return { techCategory: rule.category, candidHint: rule.candidHint ?? null };
    }
  }

  const pfc = input.personalFinanceCategory?.detailed || input.personalFinanceCategory?.primary;
  if (pfc) {
    for (const [key, category] of Object.entries(PFC_MAP)) {
      if (pfc.toUpperCase().includes(key)) {
        return { techCategory: category, candidHint: null };
      }
    }
  }

  return { techCategory: 'non_tech', candidHint: null };
}

export const TECH_CATEGORY_LABELS: Record<TechSpendCategory, string> = {
  telecom: 'Telecom / Phone',
  internet: 'Internet / Network',
  saas: 'Software / SaaS',
  cloud: 'Cloud',
  payments: 'Payments',
  utilities: 'Utilities',
  hardware_it: 'IT Hardware',
  security: 'Security',
  other_tech: 'Other technology',
  non_tech: 'Other',
};

/** Where Candid commonly helps — used for opportunity flags + avg savings callouts. */
export const CANDID_CATEGORY_OFFERS: Partial<
  Record<
    TechSpendCategory,
    { savingsPct: number; solutionLabel: string; blurb: string }
  >
> = {
  telecom: {
    savingsPct: 25,
    solutionLabel: 'business phone / UCaaS',
    blurb:
      'Candid regularly benchmarks phone and UCaaS vendors and negotiates on your behalf.',
  },
  internet: {
    savingsPct: 20,
    solutionLabel: 'business internet / connectivity',
    blurb: 'Candid shops circuits and SD-WAN so you are not locked into overpriced connectivity.',
  },
  payments: {
    savingsPct: 15,
    solutionLabel: 'merchant processing',
    blurb: 'Candid reviews processor rates and interchange so fees do not quietly creep up.',
  },
  cloud: {
    savingsPct: 15,
    solutionLabel: 'cloud / hosting',
    blurb: 'Candid can review cloud spend and recommend right-sized providers in our network.',
  },
  security: {
    savingsPct: 15,
    solutionLabel: 'security / cybersecurity',
    blurb: 'Candid matches you with vetted security partners and helps compare coverage vs cost.',
  },
  saas: {
    savingsPct: 10,
    solutionLabel: 'software / SaaS',
    blurb: 'Candid can help consolidate overlapping tools and check whether better terms are available.',
  },
};
