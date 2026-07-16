import { NextResponse } from 'next/server';
import type { Lead } from '@/components/LeadsView';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function mapPortalLeadRow(row: {
  id: string;
  analysis_review_id: string | null;
  quote_request_id: string | null;
  lead_source: Lead['source'] | string | null;
  lifecycle: Lead['lifecycle'] | string | null;
  deal_stage?: string | null;
  close_reason: Lead['closeReason'] | string | null;
  close_note: string | null;
  converted_customer_id: string | null;
  lead_data: Lead;
  created_at?: string;
}): Lead | null {
  const base = row.lead_data as Lead;
  if (!base || typeof base.id !== 'string') return null;
  return {
    ...base,
    source: (row.lead_source as Lead['source']) ?? base.source ?? 'manual',
    analysisReviewId: row.analysis_review_id ?? base.analysisReviewId,
    quoteRequestId: row.quote_request_id ?? base.quoteRequestId,
    portalLeadRowId: row.id,
    lifecycle: (row.lifecycle as Lead['lifecycle']) ?? base.lifecycle ?? 'open',
    dealStage: row.deal_stage ?? base.dealStage ?? null,
    closeReason: (row.close_reason as Lead['closeReason']) ?? base.closeReason,
    closeNote: row.close_note ?? base.closeNote,
    convertedCustomerId: row.converted_customer_id ?? base.convertedCustomerId,
  };
}

/** Admin: portal-generated leads (e.g. from bill analysis uploads). */
export async function GET() {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('portal_leads')
    .select(
      'id, analysis_review_id, quote_request_id, lead_source, lifecycle, deal_stage, close_reason, close_note, converted_customer_id, lead_data, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    if (/portal_leads/.test(error.message)) {
      return NextResponse.json({ leads: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const leads: Lead[] = (data ?? [])
    .map((row) => mapPortalLeadRow(row as Parameters<typeof mapPortalLeadRow>[0]))
    .filter((lead): lead is Lead => lead !== null);

  return NextResponse.json({ leads });
}

/** Admin: create a manually entered lead from the Leads UI. */
export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let body: { lead?: Lead };
  try {
    body = (await request.json()) as { lead?: Lead };
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const incoming = body.lead;
  if (!incoming || typeof incoming !== 'object' || !String(incoming.companyFriendly ?? '').trim()) {
    return NextResponse.json({ error: 'companyFriendly is required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const createdAt =
    incoming.createdAt && incoming.createdAt !== 'Just now'
      ? incoming.createdAt
      : new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  const leadData: Lead = {
    ...incoming,
    id: incoming.id || `lead-${crypto.randomUUID()}`,
    companyFriendly: String(incoming.companyFriendly).trim(),
    source: 'manual',
    lifecycle: incoming.lifecycle ?? 'open',
    createdAt,
    contacts: Array.isArray(incoming.contacts) ? incoming.contacts : [],
    locations: Array.isArray(incoming.locations) ? incoming.locations : [],
  };

  const existingRowId = incoming.portalLeadRowId?.trim();
  if (existingRowId) {
    const { data, error } = await admin
      .from('portal_leads')
      .update({
        lead_source: 'manual',
        lifecycle: leadData.lifecycle ?? 'open',
        lead_data: { ...leadData, portalLeadRowId: existingRowId },
      })
      .eq('id', existingRowId)
      .select(
        'id, analysis_review_id, quote_request_id, lead_source, lifecycle, deal_stage, close_reason, close_note, converted_customer_id, lead_data, created_at',
      )
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    const mapped = mapPortalLeadRow(data as Parameters<typeof mapPortalLeadRow>[0]);
    return NextResponse.json({ lead: mapped });
  }

  const { data, error } = await admin
    .from('portal_leads')
    .insert({
      analysis_review_id: null,
      quote_request_id: null,
      user_id: user?.id ?? null,
      lead_source: 'manual',
      lifecycle: leadData.lifecycle ?? 'open',
      lead_data: leadData,
    })
    .select(
      'id, analysis_review_id, quote_request_id, lead_source, lifecycle, deal_stage, close_reason, close_note, converted_customer_id, lead_data, created_at',
    )
    .single();

  if (error) {
    if (/portal_leads|lead_source|source_key/.test(error.message)) {
      return NextResponse.json(
        { error: 'Could not save lead. Ensure migration 0060 is applied.' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const mapped = mapPortalLeadRow(data as Parameters<typeof mapPortalLeadRow>[0]);
  if (!mapped) {
    return NextResponse.json({ error: 'Lead saved but could not be mapped' }, { status: 500 });
  }

  // Keep lead_data.portalLeadRowId in sync with the row id.
  if (mapped.portalLeadRowId) {
    await admin
      .from('portal_leads')
      .update({ lead_data: { ...mapped, portalLeadRowId: mapped.portalLeadRowId } })
      .eq('id', mapped.portalLeadRowId);
  }

  return NextResponse.json({ lead: mapped });
}
