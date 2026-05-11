// ── ACCOUNT CONTEXT ───────────────────────────────────────────
export const HANK_ACCOUNT_CONTEXT = {
  company: 'Acme Corporation',
  contact: 'John Mitchell',
  email: 'john@acmecorp.com',
  memberSince: 'October 2025',
  monthlySpend: 4820,
  lifetimeSavings: 8240,
  monthlySavingsIdentified: 1715,
  feeStatus: 'Active — $25/mo',
  services: [
    { name: 'UCaaS / Phone System', vendor: 'RingCentral', seats: 25, monthly: 1250, marketRate: 750, expiresDate: 'June 1, 2026', daysUntilExpiry: 40, status: 'EXPIRING URGENT' },
    { name: 'Internet Service', vendor: 'Comcast Business', speed: '500 Mbps', monthly: 420, marketRate: 280, expiresDate: 'July 15, 2026', daysUntilExpiry: 84, status: 'EXPIRING SOON' },
    { name: 'Merchant Processing', vendor: 'Square', effectiveRate: '3.1%', monthly: 1954, marketRate: 1210, billAnomaly: '$94 fax overage this month', status: 'BILL ANOMALY' },
    { name: 'Microsoft 365 Business', vendor: 'Direct', licenses: 22, inactiveLicenses: 4, monthly: 660, marketRate: 440, expiresDate: 'March 2027', status: 'ACTIVE' },
    { name: 'IT Managed Services', vendor: 'Local MSP', monthly: 630, marketRate: 425, status: 'ACTIVE' },
  ],
  externalServices: [
    { name: 'Google Workspace', vendor: 'Direct', licenses: 15, monthly: 210, candidRate: 150, expiresDate: 'August 2026', status: 'EXTERNAL — NOT WITH CANDID' },
  ],
  alerts: [
    'RingCentral expires in 40 days — 40% above market rate',
    'Square bill up $94 due to fax plan overage',
    'Comcast renewal window opens in 55 days',
    '4 inactive Microsoft 365 licenses detected',
  ],
  candid: {
    company: 'Candid Solutions & CandidPay',
    specialist: 'Candid Solutions Team',
    scheduleUrl: 'candidsolutions.com/schedule',
    services: 'Network, UCaaS, CCaaS, Security, Cloud, IoT, Commerce/Payments, Microsoft 365, Google Workspace, Adobe, IT Field Services',
    suppliers: 'Telarus, Sandler Partners, AppDirect, Intelisys (100+ suppliers)',
    paymentPartners: 'CandidPay via Linked2Pay and Hyfin',
  },
};

// ── HANK SYSTEM PROMPT ────────────────────────────────────────
export const HANK_SYSTEM_PROMPT = `You are Hank, the AI assistant embedded inside the Candid Intelligence Platform — a cost optimization and technology management SaaS built by Candid Solutions.

## YOUR PERSONALITY
You are sharp, confident, and professionally witty — think of a McKinsey analyst who also happens to be genuinely funny. You have the dry intelligence of a trusted advisor who's seen enough telecom invoices to have opinions about them (they are rarely positive). You are warm but never sycophantic. You respect the user's time. You never say "Great question!" You never pad responses with filler. You are direct, data-driven, and occasionally make a well-placed observation that gets a smile.

You can be mildly sarcastic about things like overpriced telecom contracts, auto-renewals, and vendors who silently raise rates — because your clients feel the same way and appreciate knowing their assistant does too. Think: "Comcast does love a good auto-renewal. You, however, do not have to." Keep it professional. One quip per response maximum. Never at the client's expense.

## YOUR INTELLIGENCE
You are a specialist in business technology cost optimization. You know:
- UCaaS (RingCentral, Vonage, Dialpad, 8x8, Zoom Phone) pricing, contract structures, and how to negotiate
- Internet/broadband pricing benchmarks, term structures, and when carriers actually have room to move
- Merchant processing — interchange, effective rates, tiered vs. flat rate, and what "industry standard" actually means vs. what processors claim
- Microsoft 365 and Google Workspace licensing — inactive seats, version mismatches, and reseller vs. direct pricing differences
- Security, CCaaS, Cloud, IT managed services — enough to identify overspend and ask the right questions
- Contract expiration timing strategy — when to act (60-90 days out), when carriers negotiate (right before renewal), when they don't (within 30 days)
- The difference between what a vendor's sales rep tells you and what Candid can actually get through master agent relationships

## WHAT YOU KNOW ABOUT THIS SPECIFIC ACCOUNT
${JSON.stringify(HANK_ACCOUNT_CONTEXT, null, 2)}

## YOUR RULES
1. Every response is grounded in the account data above. Never make up numbers.
2. Always surface the most actionable insight first. Lead with what matters.
3. When recommending action, always include the next step — schedule a call, upload a bill, contact your specialist.
4. Never mention Candid's supplier names to the client. Never mention commissions, margins, or agent relationships.
5. Never send a full proposal or detailed pricing breakdown unprompted.
6. Keep responses concise. 2-4 short paragraphs maximum unless the user explicitly asks for detail.
7. Format with HTML where helpful — <strong> for key figures, <br> for line breaks between points.
8. If the user asks something outside your knowledge, acknowledge it briefly and redirect.`;

// ── SERVICE PROFILES ──────────────────────────────────────────
export type ServiceProfileKey = 'merchant' | 'internet' | 'ucaas' | 'microsoft' | 'security' | 'cloud' | 'default';

export interface ServiceProfile {
  keywords?: string[];
  name: string;
  vendor: string;
  current: string;
  market: string;
  savings: string;
  note: string;
}

export const serviceProfiles: Record<ServiceProfileKey, ServiceProfile> = {
  merchant: {
    keywords: ['merchant', 'square', 'stripe', 'processing', 'payment', 'pos', 'clover', 'toast', 'authorize', 'chase paymentech', 'worldpay', 'first data', 'heartland'],
    name: 'Merchant Processing Statement',
    vendor: 'Detected from fee structure and processing rate format',
    current: '$1,860', market: '$1,210', savings: '$650/mo',
    note: "Your effective processing rate is running higher than it should for your volume. There's real money here — enough to more than cover the platform fee. A 15-minute call with your Candid specialist is all it takes.",
  },
  internet: {
    keywords: ['comcast', 'spectrum', 'att', 'verizon', 'cox', 'lumen', 'centurylink', 'frontier', 'internet', 'broadband', 'fiber', 'coax'],
    name: 'Internet Service Invoice',
    vendor: 'Detected from service type and billing structure',
    current: '$420', market: '$280', savings: '$140/mo',
    note: "Looks like your internet rate has been creeping up. Current market pricing for comparable service is meaningfully lower. This is an easy win — a quick renewal conversation is usually all it takes.",
  },
  ucaas: {
    keywords: ['ringcentral', 'vonage', 'dialpad', '8x8', 'zoom phone', 'aircall', 'nextiva', 'microsoft teams', 'mitel', 'avaya', 'ucaas', 'unified communications', 'voice', 'sip'],
    name: 'UCaaS / Phone System Invoice',
    vendor: 'Detected from seat-based billing and feature set',
    current: '$1,250', market: '$750', savings: '$500/mo',
    note: "Your per-seat cost is running well above current market rates for comparable UCaaS features. With contracts in this category auto-renewing at legacy pricing, now is the ideal time to take a look.",
  },
  microsoft: {
    keywords: ['microsoft', 'office 365', 'm365', 'sharepoint', 'teams', 'azure', 'exchange', 'outlook'],
    name: 'Microsoft 365 Subscription',
    vendor: 'Detected from license-based billing format',
    current: '$660', market: '$440', savings: '$220/mo',
    note: "A few things jumped out immediately — you may have inactive licenses that can be removed right now with no contract change. Rightsize first, then we look at rate.",
  },
  security: {
    keywords: ['security', 'firewall', 'endpoint', 'sophos', 'crowdstrike', 'sentinel', 'soc', 'ciso', 'fortinet', 'palo alto', 'checkpoint'],
    name: 'Security Services Invoice',
    vendor: 'Detected from service category and billing structure',
    current: '$890', market: '$620', savings: '$270/mo',
    note: "Security spend is one of the most over-complicated categories we see. There's often significant redundancy between tools. Let's take a look at what you actually need vs. what you're paying for.",
  },
  cloud: {
    keywords: ['aws', 'azure', 'google cloud', 'gcp', 'storage', 'backup', 'cloud', 'hosting', 's3', 'dropbox', 'box'],
    name: 'Cloud / Storage Invoice',
    vendor: 'Detected from usage-based billing format',
    current: '$540', market: '$380', savings: '$160/mo',
    note: "Cloud billing is notoriously hard to read. Unused storage and orphaned resources are usually the culprits. A quick audit typically turns up immediate savings.",
  },
  default: {
    name: 'Technology Service Invoice',
    vendor: 'Hank is still identifying the exact service type',
    current: '$--', market: '$--', savings: 'TBD',
    note: "Your bill has been received and is heading to a real human on the Candid team for a thorough review. We'll have findings back to you within 24 hours — often much sooner.",
  },
};

export const processingMessages = [
  'Reading your bill...',
  'Identifying service type...',
  'Comparing to market rates...',
  "Running Hank's analysis...",
  'Almost there...',
];

// ── NAVIGATION ────────────────────────────────────────────────
export const ADMIN_VIEW_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  services: 'My Services',
  serviceability: 'Add a New Service',
  reports: 'Reports',
  chat: 'Hank — AI Assistant',
  roadmap: 'Platform Roadmap',
  alerts: 'Alerts & Actions',
  settings: 'Account Settings',
};

export const MEMBER_VIEW_TITLES: Record<string, string> = {
  mdashboard: 'Dashboard',
  mservices: 'My Services',
  maddservice: 'Add a New Service',
  mreports: 'Reports',
  mchat: 'Hank — AI Assistant',
  malerts: 'Alerts & Actions',
  msettings: 'Settings',
};

// ── HANK API ──────────────────────────────────────────────────
/** Full Claude `messages` array, ending with the latest user turn (already appended by caller). */
export async function callHankAPI(
  messages: { role: string; content: string }[]
): Promise<string> {
  try {
    const response = await fetch("/api/hank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = (await response.json()) as { text?: string; error?: string };
    if (data.text) return data.text;
    throw new Error(data.error ?? "empty response");
  } catch (err) {
    console.error('Hank API error:', err);
    return "Something went sideways on my end — probably not unlike your current RingCentral contract. Try again in a moment, or reach out to your Candid specialist directly.";
  }
}

// ── SERVICE TYPE DETECTION ────────────────────────────────────
export function detectServiceType(filename: string): ServiceProfileKey {
  if (!filename) return 'default';
  const lower = filename.toLowerCase();
  for (const [type, profile] of Object.entries(serviceProfiles)) {
    if (type === 'default') continue;
    if ((profile as ServiceProfile).keywords?.some((kw) => lower.includes(kw))) {
      return type as ServiceProfileKey;
    }
  }
  return 'default';
}
