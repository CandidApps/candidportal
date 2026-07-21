import type { PricingStructureOption } from '@/lib/analysis/types';
import { computeUcaasQuoteFromSnapshot } from '@/lib/ucaas/quote-engine';
import { quoteItemsFromSnapshot } from '@/lib/quotes/quote-items';
import type { PublishedQuoteSnapshot } from '@/lib/quotes/types';
import { formatSavingsMoney } from '@/lib/services/quote-savings';
import type { QuoteRequestRow } from '@/lib/services/quote-requests';
import { resolveQuoteServiceLabel } from '@/lib/services/quote-requests';
import { launchAdminZohoCompose } from '@/lib/email/admin-compose';
import { bootstrapAdminQuoteDraft, type LeadQuoteWorkbenchHint } from '@/lib/quotes/quote-workbench-defaults';
import { snapshotHasDeliverable } from '@/lib/quotes/quote-items';

type LeadEmailHint = LeadQuoteWorkbenchHint & {
  contacts?: Array<{ name?: string; email?: string; isPrimary?: boolean }>;
};

export async function fetchAndLaunchQuoteReadyEmail(
  quoteRequestId: string,
  linkedLead?: LeadEmailHint | null,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await fetch(`/api/admin/quote-requests/${quoteRequestId}`);
    const data = (await res.json()) as { request?: QuoteRequestRow; error?: string };
    if (!res.ok || !data.request) {
      return { ok: false, reason: data.error ?? 'Could not load quote' };
    }
    const row = data.request;
    const snap = row.published_quote_snapshot ?? row.draft_quote_snapshot ?? null;
    const bootstrapped = bootstrapAdminQuoteDraft(snap, row, linkedLead);
    if (!row.published_quote_snapshot && !snapshotHasDeliverable(bootstrapped)) {
      return { ok: false, reason: 'Add pricing in the quote first (open Continue quote).' };
    }
    const launched = launchQuoteReadyCustomerEmail({
      row,
      linkedLead,
      snapshot: row.published_quote_snapshot ?? bootstrapped,
    });
    if (!launched) return { ok: false, reason: 'No customer email on the lead or quote.' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Could not open email compose' };
  }
}

type SavingsPair = { monthly: number; annual: number };

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
  snapshot?: PublishedQuoteSnapshot | null;
}): { to: string | null; subject: string; body: string } {
  const snapshot = params.snapshot ?? params.row.published_quote_snapshot;
  const serviceLabel =
    snapshot?.serviceLabel?.trim() || resolveQuoteServiceLabel(params.row);
  const subject = `Your ${serviceLabel} Quote is Ready`;
  const pair = publishedQuoteSavingsPair(snapshot);
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
  snapshot?: PublishedQuoteSnapshot | null;
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
