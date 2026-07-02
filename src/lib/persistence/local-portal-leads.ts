import type { Lead } from '@/components/LeadsView';
import { newLocalId } from '@/lib/persistence/local-data-store';

const STORAGE_KEY = 'candid-portal-leads-v1';

type StoredPortalLead = {
  id: string;
  analysis_review_id: string;
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

export function upsertLocalPortalLead(
  analysisReviewId: string,
  userId: string,
  lead: Lead,
): Lead {
  const rows = readLeads().filter((r) => r.analysis_review_id !== analysisReviewId);
  rows.unshift({
    id: newLocalId(),
    analysis_review_id: analysisReviewId,
    user_id: userId,
    lead,
    created_at: new Date().toISOString(),
  });
  writeLeads(rows);
  return lead;
}

export function listLocalPortalLeads(): Lead[] {
  return readLeads()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((r) => r.lead);
}
