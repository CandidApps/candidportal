import { normalizeUid } from '@/lib/bmw/deal-key';
import { getBmwDeals } from '@/lib/bmw/deal-master';
import type { BmwAgentRate } from '@/lib/bmw/types';
import type { Customer } from '@/components/CustomersView';
import { commissionRowCustomer } from '@/lib/bmw/commission-match';

/** Columns that may carry the agent / rep name on a commission report row. */
export const AGENT_NAME_FIELDS = [
  'agent_name',
  'agent',
  'rep',
  'sales_rep_name',
  'SalesRep',
  'sales_rep',
  'partner',
];

function normName(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Recognize agent from report row fields or existing deals with same merchant. */
export function recognizeAgentFromRow(
  row: Record<string, unknown>,
  merchant: string,
  agents: BmwAgentRate[],
): BmwAgentRate | null {
  for (const field of AGENT_NAME_FIELDS) {
    const raw = row[field];
    if (raw == null || raw === '') continue;
    const wanted = normName(raw);
    if (!wanted) continue;
    const byName = agents.find((a) => normName(a.name) === wanted || normName(a.id) === wanted);
    if (byName) return byName;
  }

  if (merchant) {
    const wanted = normalizeUid(merchant);
    const deal = getBmwDeals().find(
      (d) => d.agentCommId && normalizeUid(d.merchant) === wanted,
    );
    if (deal) {
      const profile = agents.find((a) => a.id === deal.agentCommId);
      if (profile) return profile;
    }
  }

  return null;
}

const NAME_STOP_WORDS = new Set([
  'llc', 'inc', 'incorporated', 'corp', 'corporation', 'company', 'ltd',
  'the', 'and', 'of', 'dba', 'group', 'center', 'centre', 'clinic',
  'services', 'solutions', 'partners', 'holdings',
]);

function distinctiveTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !NAME_STOP_WORDS.has(t));
}

/** Match line-item merchant name to an existing parent customer. */
export function recognizeParentCustomer(itemCustomer: string, customers: Customer[]): Customer | null {
  const itemTokens = distinctiveTokens(itemCustomer);
  if (!itemTokens.length) return null;

  let best: Customer | null = null;
  let bestScore = 0;
  for (const customer of customers) {
    const tokens = new Set(distinctiveTokens(customer.company));
    if (!tokens.size) continue;
    let score = itemTokens.reduce((s, t) => s + (tokens.has(t) ? 1 : 0), 0);
    if (score > 0 && tokens.has(itemTokens[0]!)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = customer;
    }
  }
  return bestScore >= 2 ? best : null;
}

/** Default agent for a customer from their existing deals. */
export function agentForCustomer(customer: Customer, agents: BmwAgentRate[]): BmwAgentRate | null {
  const wanted = normalizeUid(customer.company);
  const deal = getBmwDeals().find(
    (d) => d.agentCommId && normalizeUid(d.merchant) === wanted,
  );
  return deal ? agents.find((a) => a.id === deal.agentCommId) ?? null : null;
}

export function merchantFromRow(row: Record<string, unknown>): string {
  return commissionRowCustomer(row);
}
