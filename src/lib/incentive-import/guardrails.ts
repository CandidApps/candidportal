import type { SpiffFlag } from '@/lib/incentive-import/types';

/** Referrer-voice phrases from the supplier-incentive-import skill (the customer is the one signing up). */
const REFERRAL_VOICE: [RegExp, string][] = [
  [/\brefer/i, 'refer / referral'],
  [/\byou bring\b|\bbring in\b/i, 'bring in'],
  [/\byou close\b|\bdeals you\b/i, 'you close'],
  [/\byou send\b/i, 'you send'],
  [/\byou promote\b/i, 'you promote'],
  [/\byou introduce\b|\bintroduce us\b/i, 'introduce'],
  [/\bclients you\b|\bcustomers you\b/i, 'customers you'],
  [/\byou acquire\b/i, 'you acquire'],
  [/\byou connect\b/i, 'you connect'],
  [/\byou invite\b/i, 'you invite'],
  [/\bon your behalf\b/i, 'on your behalf'],
  [/\byour (audience|friends|link|network|contacts|list|downline)\b|\bdownline\b/i, 'your audience / link / network'],
  [/\bunder you\b|\bpeople you\b|\beach person who\b/i, 'people you / under you'],
];

/** Channel / internal vocabulary that should never reach members. */
const INTERNAL_WORDS: [RegExp, string][] = [
  [/\bagents?\b/i, 'agent'],
  [/\bpartners?\b|\bpartnership\b/i, 'partner'],
  [/\bchannel\b/i, 'channel'],
  [/\b(sell|sells|selling|sold|resell\w*|reseller\w*)\b/i, 'sell / sold'],
  [/\bspiff?s?\b/i, 'SPIFF'],
  [/\bcommissions?\b/i, 'commission'],
  [/\breps?\b/i, 'rep'],
  [/\bquotas?\b/i, 'quota'],
  [/\b(mrc|mrr|tcv|acv|msr)\b/i, 'MRC / TCV / ACV'],
  [/\bnew logos?\b/i, 'new logo'],
  [/\bbooked\b|\bbookings?\b/i, 'booked'],
  [/\bdeal registration\b|\bregistered deals?\b|\bdeals? reg\b/i, 'deal registration'],
  [/\bOE Submit\b|\border entry\b/i, 'order entry'],
  [/\bour (incentive|payout|split|share)\b|\bof ours\b|\bcandid('s)? net\b/i, 'our incentive / Candid net'],
];

const REWARD_IN_COPY = /\b\d+(?:\.\d+)?\s?x\b(?!\s*\d)/i;

export function customerCopyIssues(text: string): string[] {
  if (!text.trim()) return [];
  const issues: string[] = [];
  for (const [re, label] of REFERRAL_VOICE) if (re.test(text)) issues.push(`Referral voice: "${label}"`);
  for (const [re, label] of INTERNAL_WORDS) if (re.test(text)) issues.push(`Internal wording: "${label}"`);
  if (REWARD_IN_COPY.test(text)) issues.push('Reward multiplier in copy (shown separately per member tier)');
  return issues;
}

const RANGE_RE = /(\d+(?:\.\d+)?)\s*[xX%]?\s*(?:-|–|to)\s*\$?(\d+(?:\.\d+)?)\s*[xX%]/;

export type GuardrailInput = {
  flag: SpiffFlag;
  customerName: string;
  customerDescription: string;
  customerCriteria: string;
  payoutRaw?: string;
  payoutUpTo: boolean;
};

/** Deterministic checks after the AI pass. Only ever downgrades Yes → Review. */
export function applyGuardrails(input: GuardrailInput): { flag: SpiffFlag; issues: string[] } {
  if (input.flag === 'no') return { flag: 'no', issues: [] };
  const issues = [
    ...new Set(
      [input.customerName, input.customerDescription, input.customerCriteria].flatMap(customerCopyIssues),
    ),
  ];
  if (input.payoutRaw && RANGE_RE.test(input.payoutRaw) && !input.payoutUpTo) {
    issues.push('Payout is a range but not marked "up to"');
  }
  if (!input.customerName.trim() || !input.customerDescription.trim()) {
    issues.push('Missing customer-facing name or description');
  }
  return { flag: issues.length && input.flag === 'yes' ? 'review' : input.flag, issues };
}
