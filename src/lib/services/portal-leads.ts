import type { Lead, LeadCloseReason, LeadLifecycle, LeadSource } from '@/components/LeadsView';
import type { BillAnalysisReviewRow } from '@/lib/bill-parse-types';
import { isLocalPersistence } from '@/lib/persistence/config';
import {
  listLocalPortalLeads,
  upsertLocalPortalLead,
  upsertLocalPortalLeadForQuote,
  updateLocalPortalLeadLifecycle,
} from '@/lib/persistence/local-portal-leads';
import type { QuoteRequestLocation } from '@/lib/services/quote-requests';
import { resolveQuoteServiceLabel, serviceTypeLabel } from '@/lib/services/quote-requests';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export type PortalLeadPatch = {
  lifecycle?: LeadLifecycle;
  closeReason?: LeadCloseReason;
  closeNote?: string;
  convertedCustomerId?: string;
  leadData?: Lead;
};

type PortalLeadDbRow = {
  id: string;
  analysis_review_id: string | null;
  quote_request_id: string | null;
  user_id: string | null;
  lead_source: LeadSource;
  lifecycle: LeadLifecycle;
  close_reason: LeadCloseReason | null;
  close_note: string | null;
  converted_customer_id: string | null;
  lead_data: Lead;
  created_at: string;
};

function formatLeadCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) {
    return new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function mapPortalLeadRow(row: PortalLeadDbRow): Lead {
  const base = row.lead_data as Lead;
  return {
    ...base,
    source: row.lead_source ?? base.source,
    analysisReviewId: row.analysis_review_id ?? base.analysisReviewId,
    quoteRequestId: row.quote_request_id ?? base.quoteRequestId,
    portalLeadRowId: row.id,
    lifecycle: row.lifecycle ?? base.lifecycle ?? 'open',
    closeReason: row.close_reason ?? base.closeReason,
    closeNote: row.close_note ?? base.closeNote,
    convertedCustomerId: row.converted_customer_id ?? base.convertedCustomerId,
    createdAt: base.createdAt || formatLeadCreatedAt(row.created_at),
  };
}

export function buildLeadFromBillReview(
  review: BillAnalysisReviewRow,
  opts?: { companyName?: string },
): Lead {
  const contactName = review.customer_name?.trim() || 'Portal customer';
  const email = review.customer_email?.trim() || '';
  const vendor = review.vendor_name;
  const category = review.category_label ?? review.detected_category;
  const created = new Date(review.created_at);
  const createdAt = Number.isFinite(created.getTime())
    ? created.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  return {
    id: `lead-review-${review.id}`,
    companyFriendly: opts?.companyName?.trim() || contactName || vendor,
    helpWith: `Bill analysis — ${vendor} (${category})`,
    currentTechnology: vendor,
    status: 'new',
    source: 'bill_analysis',
    analysisReviewId: review.id,
    lifecycle: 'open',
    createdAt,
    contacts: [
      {
        id: `lc-${review.id}`,
        name: contactName,
        email,
        phone: '',
        role: 'Primary contact',
        isDecisionMaker: true,
        isPrimary: true,
      },
    ],
    locations: [],
  };
}

export function buildLeadFromQuoteRequest(input: {
  quoteRequestId: string;
  mode?: 'request' | 'add-services';
  company?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  serviceTypeId?: string | null;
  services?: string[];
  vendors?: string[];
  note?: string | null;
  location?: QuoteRequestLocation | null;
  subject?: string | null;
}): Lead {
  const serviceLabel = resolveQuoteServiceLabel({
    service_type_id: input.serviceTypeId ?? null,
    services: input.services ?? [],
    note: input.note ?? null,
  });
  const vendorList = (input.vendors ?? []).filter(Boolean);
  const modeLabel = input.mode === 'add-services' ? 'Add services' : 'Quote request';
  const createdAt = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const contactName = input.contactName?.trim() || 'Portal customer';
  const company = input.company?.trim() || contactName || serviceLabel;

  const locations =
    input.location?.city || input.location?.street
      ? [
          {
            id: `ll-quote-${input.quoteRequestId}`,
            label: input.location?.label?.trim() || 'Service location',
            street: input.location?.street?.trim() || '',
            city: input.location?.city?.trim() || '',
            state: input.location?.state?.trim() || '',
            zip: input.location?.zip?.trim() || '',
            isPrimary: true,
          },
        ]
      : [];

  return {
    id: `lead-quote-${input.quoteRequestId}`,
    companyFriendly: company,
    helpWith: `${modeLabel} — ${serviceLabel}`,
    currentTechnology: vendorList.length ? vendorList.join(', ') : input.services?.join(', ') || undefined,
    status: 'new',
    source: 'quote_request',
    quoteRequestId: input.quoteRequestId,
    lifecycle: 'open',
    createdAt,
    contacts: [
      {
        id: `lc-quote-${input.quoteRequestId}`,
        name: contactName,
        email: input.email?.trim() || '',
        phone: input.phone?.trim() || '',
        role: 'Primary contact',
        isDecisionMaker: true,
        isPrimary: true,
      },
    ],
    locations,
  };
}

export async function createPortalLeadForBillReview(
  review: BillAnalysisReviewRow,
  opts?: { companyName?: string },
): Promise<Lead | null> {
  const lead = buildLeadFromBillReview(review, opts);

  if (isLocalPersistence()) {
    return upsertLocalPortalLead(review.id, review.user_id, lead);
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('portal_leads').upsert(
    {
      analysis_review_id: review.id,
      user_id: review.user_id,
      lead_source: 'bill_analysis',
      lifecycle: 'open',
      lead_data: lead,
    },
    { onConflict: 'analysis_review_id' },
  );

  if (error) {
    if (/portal_leads/.test(error.message)) {
      console.warn('[portal-leads] table missing — lead not persisted', error.message);
      return lead;
    }
    console.error('[portal-leads] insert failed', error.message);
    return null;
  }

  return lead;
}

export async function createPortalLeadForQuoteRequest(input: {
  quoteRequestId: string;
  userId: string;
  mode?: 'request' | 'add-services';
  company?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  serviceTypeId?: string | null;
  services?: string[];
  vendors?: string[];
  note?: string | null;
  location?: QuoteRequestLocation | null;
  subject?: string | null;
}): Promise<Lead | null> {
  const lead = buildLeadFromQuoteRequest(input);

  if (isLocalPersistence()) {
    return upsertLocalPortalLeadForQuote(input.quoteRequestId, input.userId, lead);
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('portal_leads').upsert(
    {
      quote_request_id: input.quoteRequestId,
      user_id: input.userId,
      lead_source: 'quote_request',
      lifecycle: 'open',
      lead_data: lead,
    },
    { onConflict: 'quote_request_id' },
  );

  if (error) {
    if (/portal_leads|quote_request_id|0060/.test(error.message)) {
      console.warn('[portal-leads] quote lead not persisted', error.message);
      return lead;
    }
    console.error('[portal-leads] quote insert failed', error.message);
    return null;
  }

  return lead;
}

export async function fetchPortalLeads(): Promise<Lead[]> {
  if (isLocalPersistence()) {
    return listLocalPortalLeads();
  }

  const res = await fetch('/api/admin/leads', { cache: 'no-store' });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'Failed to load leads');
  }
  const data = (await res.json()) as { leads?: Lead[] };
  return data.leads ?? [];
}

export async function patchPortalLead(portalLeadRowId: string, patch: PortalLeadPatch): Promise<{ ok: boolean; error?: string }> {
  if (isLocalPersistence()) {
    updateLocalPortalLeadLifecycle(portalLeadRowId, patch);
    return { ok: true };
  }

  const res = await fetch(`/api/admin/leads/${portalLeadRowId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: data.error ?? 'Update failed' };
  return { ok: true };
}

export function findMatchingLeads(leads: Lead[], input: { company?: string; email?: string }): Lead[] {
  const company = input.company?.trim().toLowerCase();
  const email = input.email?.trim().toLowerCase();
  if (!company && !email) return [];

  return leads.filter((lead) => {
    if (lead.lifecycle === 'closed') return false;
    const pc = lead.contacts.find((c) => c.isPrimary) ?? lead.contacts[0];
    const companyMatch =
      company &&
      (lead.companyFriendly.toLowerCase().includes(company) ||
        (lead.companyLegal?.toLowerCase().includes(company) ?? false));
    const emailMatch = email && pc?.email.toLowerCase() === email;
    return Boolean(companyMatch || emailMatch);
  });
}

export { serviceTypeLabel };
