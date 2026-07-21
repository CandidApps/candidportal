import type { PricingStructureOption } from '@/lib/analysis/types';
import { computeUcaasQuoteFromSnapshot } from '@/lib/ucaas/quote-engine';
import { quoteItemsFromSnapshot } from '@/lib/quotes/quote-items';
import type { PublishedQuoteSnapshot } from '@/lib/quotes/types';
import { formatSavingsMoney } from '@/lib/services/quote-savings';
import type { QuoteRequestRow } from '@/lib/services/quote-requests';
import { resolveQuoteServiceLabel } from '@/lib/services/quote-requests';
import { launchAdminZohoCompose } from '@/lib/email/admin-compose';

type SavingsPair = { monthly: number; annual: number };

type LeadEmailHint = {
  contacts?: Array<{ name?: string; email?: string; isPrimary?: boolean }>;
};

function bestSavings(candidates: SavingsPair[]): SavingsPair | null {
  let top: SavingsPair | null = null;
  for (const c of candidates) {
    if (!Number.isFinite(c.annual) || c.annual <= 0) continue;
    if (!top || c.annual > top.annual) top = c;
  }
  return top;
}

function collectFromPricingOptions(options: PricingStructureOption[] | undefined, out: SavingsPair[]) {
  if (!options?.length) return;
  const selected = options.filter((o) => o.selected);
  const pool = selected.length ? selected : options;
  for (const o of pool) {
    if (o.annualSavings > 0) out.push({ monthly: o.monthlySavings, annual: o.annualSavings });
  }
}

/** Best annual savings headline from a published quote snapshot (items + root). */
export function publishedQuoteSavingsPair(
  snapshot: PublishedQuoteSnapshot | null | undefined,
): SavingsPair | null {
  if (!snapshot) return null;
  const candidates: SavingsPair[] = [];

  const absorb = (partial: {
    pricingStructureOptions?: PricingStructureOption[];
    ucaasQuote?: PublishedQuoteSnapshot['ucaasQuote'];
  }) => {
    collectFromPricingOptions(partial.pricingStructureOptions, candidates);
    if (partial.ucaasQuote) {
      try {
        const totals = computeUcaasQuoteFromSnapshot(partial.ucaasQuote);
        if (totals.annualSavings > 0) {
          candidates.push({ monthly: totals.monthlySavings, annual: totals.annualSavings });
        }
      } catch {
        /* ignore */
      }
    }
  };

  absorb(snapshot);
  for (const item of quoteItemsFromSnapshot(snapshot)) {
    absorb(item);
  }

  return bestSavings(candidates);
}

export function resolveQuoteCustomerEmail(
  row: Pick<QuoteRequestRow, 'contact_email'>,
  linkedLead?: LeadEmailHint | null,
): string | null {
  const direct = row.contact_email?.trim();
  if (direct) return direct;
  const contacts = linkedLead?.contacts ?? [];
  const primary = contacts.find((c) => c.isPrimary && c.email?.trim()) ?? contacts.find((c) => c.email?.trim());
  return primary?.email?.trim() || null;
}

function customerFirstName(
  row: Pick<QuoteRequestRow, 'contact_name'>,
  linkedLead?: LeadEmailHint | null,
): string {
  const fromRow = row.contact_name?.trim();
  const contacts = linkedLead?.contacts ?? [];
  const primary =
    contacts.find((c) => c.isPrimary && c.name?.trim()) ?? contacts.find((c) => c.name?.trim());
  const full = fromRow || primary?.name?.trim() || '';
  if (!full) return 'there';
  return full.split(/\s+/)[0] ?? full;
}

export function buildQuoteReadyCustomerEmail(params: {
  row: QuoteRequestRow;
  linkedLead?: LeadEmailHint | null;
}): { to: string | null; subject: string; body: string } {
  const serviceLabel = resolveQuoteServiceLabel(params.row);
  const subject = `Your ${serviceLabel} Quote is Ready`;
  const pair = publishedQuoteSavingsPair(params.row.published_quote_snapshot);
  const savingsPhrase =
    pair && pair.annual > 0 ? `${formatSavingsMoney(pair.annual)} per year` : 'savings on your account';
  const firstName = customerFirstName(params.row, params.linkedLead);
  const body = [
    `Hi ${firstName},`,
    '',
    `We have your quote ready to review. We've identified ${savingsPhrase}! Please let me know when you are available to review the quote.`,
    '',
  ].join('\n');

  return {
    to: resolveQuoteCustomerEmail(params.row, params.linkedLead),
    subject,
    body,
  };
}

export function launchQuoteReadyCustomerEmail(params: {
  row: QuoteRequestRow;
  linkedLead?: LeadEmailHint | null;
}): boolean {
  const { to, subject, body } = buildQuoteReadyCustomerEmail(params);
  if (!to) return false;
  launchAdminZohoCompose({
    to,
    subject,
    body,
    contextLabel: params.row.company?.trim() || params.row.contact_name?.trim() || 'Customer',
    quoteRequestId: params.row.id,
  });
  return true;
}
