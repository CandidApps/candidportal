import type { Lead } from '@/components/LeadsView';
import type { PortalLeadPatch } from '@/lib/services/portal-leads';
import { newLocalId } from '@/lib/persistence/local-data-store';

const STORAGE_KEY = 'candid-portal-leads-v1';

type StoredPortalLead = {
  id: string;
  analysis_review_id: string | null;
  quote_request_id: string | null;
  user_id: string;
  lead: Lead;
  created_at: string;
};

function readLeads(): StoredPortalLead[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredPortalLead[]) : [];
  } catch {
    return [];
  }
}

function writeLeads(rows: StoredPortalLead[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

function hydrateLead(row: StoredPortalLead): Lead {
  return {
    ...row.lead,
    portalLeadRowId: row.id,
    analysisReviewId: row.analysis_review_id ?? row.lead.analysisReviewId,
    quoteRequestId: row.quote_request_id ?? row.lead.quoteRequestId,
  };
}

export function upsertLocalPortalLead(
  analysisReviewId: string,
  userId: string,
  lead: Lead,
): Lead {
  const rows = readLeads().filter((r) => r.analysis_review_id !== analysisReviewId);
  const id = lead.portalLeadRowId ?? newLocalId();
  const next: StoredPortalLead = {
    id,
    analysis_review_id: analysisReviewId,
    quote_request_id: null,
    user_id: userId,
    lead: { ...lead, portalLeadRowId: id, analysisReviewId, source: 'bill_analysis', lifecycle: lead.lifecycle ?? 'open' },
    created_at: new Date().toISOString(),
  };
  rows.unshift(next);
  writeLeads(rows);
  return next.lead;
}

export function upsertLocalPortalLeadForQuote(
  quoteRequestId: string,
  userId: string,
  lead: Lead,
): Lead {
  const rows = readLeads().filter((r) => r.quote_request_id !== quoteRequestId);
  const id = lead.portalLeadRowId ?? newLocalId();
  const next: StoredPortalLead = {
    id,
    analysis_review_id: null,
    quote_request_id: quoteRequestId,
    user_id: userId,
    lead: { ...lead, portalLeadRowId: id, quoteRequestId, source: 'quote_request', lifecycle: lead.lifecycle ?? 'open' },
    created_at: new Date().toISOString(),
  };
  rows.unshift(next);
  writeLeads(rows);
  return next.lead;
}

export function upsertLocalManualPortalLead(userId: string | null, lead: Lead): Lead {
  const rows = readLeads();
  const id = lead.portalLeadRowId ?? newLocalId();
  const hydrated: Lead = {
    ...lead,
    portalLeadRowId: id,
    source: 'manual',
    lifecycle: lead.lifecycle ?? 'open',
  };
  const existingIdx = rows.findIndex((r) => r.id === id || r.lead.id === lead.id);
  const next: StoredPortalLead = {
    id,
    analysis_review_id: null,
    quote_request_id: null,
    user_id: userId ?? '',
    lead: hydrated,
    created_at:
      existingIdx >= 0 ? rows[existingIdx]!.created_at : new Date().toISOString(),
  };
  if (existingIdx >= 0) rows.splice(existingIdx, 1);
  rows.unshift(next);
  writeLeads(rows);
  return hydrated;
}

export function updateLocalPortalLeadLifecycle(portalLeadRowId: string, patch: PortalLeadPatch): void {
  const rows = readLeads();
  const idx = rows.findIndex((r) => r.id === portalLeadRowId);
  if (idx < 0) return;
  const row = rows[idx];
  const lead: Lead = {
    ...row.lead,
    ...(patch.leadData ?? {}),
    lifecycle: patch.lifecycle ?? row.lead.lifecycle,
    closeReason: patch.closeReason ?? row.lead.closeReason,
    closeNote: patch.closeNote ?? row.lead.closeNote,
    convertedCustomerId: patch.convertedCustomerId ?? row.lead.convertedCustomerId,
    status: patch.lifecycle === 'closed' ? 'inactive' : row.lead.status,
  };
  rows[idx] = { ...row, lead };
  writeLeads(rows);
}

export function listLocalPortalLeads(): Lead[] {
  return readLeads()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(hydrateLead);
}

export function findLocalPortalLeadByQuoteRequest(quoteRequestId: string): Lead | null {
  const row = readLeads().find((r) => r.quote_request_id === quoteRequestId);
  return row ? hydrateLead(row) : null;
}
