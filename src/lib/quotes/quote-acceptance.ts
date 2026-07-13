import type { UcaasQuoteLine } from '@/lib/ucaas/types';

/** Persisted when a customer accepts a published analysis or quote request. */
export type QuoteCustomerAcceptance = {
  acceptedAt: string;
  details: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  serviceLabel: string | null;
  monthlyTotal: number | null;
  setupTotal: number | null;
  annualSavings: number | null;
  monthlySavings: number | null;
  /** Snapshot of UCaaS lines at accept time (after customer qty tweaks). */
  lines: UcaasQuoteLine[] | null;
  ticketId: string | null;
};

export function parseQuoteCustomerAcceptance(raw: unknown): QuoteCustomerAcceptance | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const acceptedAt = typeof o.acceptedAt === 'string' ? o.acceptedAt : null;
  if (!acceptedAt) return null;
  return {
    acceptedAt,
    details: typeof o.details === 'string' ? o.details : null,
    contactName: typeof o.contactName === 'string' ? o.contactName : null,
    contactEmail: typeof o.contactEmail === 'string' ? o.contactEmail : null,
    contactPhone: typeof o.contactPhone === 'string' ? o.contactPhone : null,
    serviceLabel: typeof o.serviceLabel === 'string' ? o.serviceLabel : null,
    monthlyTotal: typeof o.monthlyTotal === 'number' ? o.monthlyTotal : null,
    setupTotal: typeof o.setupTotal === 'number' ? o.setupTotal : null,
    annualSavings: typeof o.annualSavings === 'number' ? o.annualSavings : null,
    monthlySavings: typeof o.monthlySavings === 'number' ? o.monthlySavings : null,
    lines: Array.isArray(o.lines) ? (o.lines as UcaasQuoteLine[]) : null,
    ticketId: typeof o.ticketId === 'string' ? o.ticketId : null,
  };
}

export function formatAcceptanceSummary(acceptance: QuoteCustomerAcceptance): string {
  const parts: string[] = ['Customer accepted this quote.'];
  if (acceptance.monthlyTotal != null) {
    parts.push(`Monthly ~$${acceptance.monthlyTotal.toFixed(2)}`);
  }
  if (acceptance.annualSavings != null && acceptance.annualSavings > 0) {
    parts.push(`Est. annual savings ~$${acceptance.annualSavings.toFixed(2)}`);
  }
  if (acceptance.details?.trim()) {
    parts.push(`Details: ${acceptance.details.trim()}`);
  }
  return parts.join(' ');
}
