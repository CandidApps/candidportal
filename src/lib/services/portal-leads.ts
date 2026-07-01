import type { Lead } from '@/components/LeadsView';
import type { BillAnalysisReviewRow } from '@/lib/bill-parse-types';
import { isLocalPersistence } from '@/lib/persistence/config';
import {
  listLocalPortalLeads,
  upsertLocalPortalLead,
} from '@/lib/persistence/local-portal-leads';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

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
