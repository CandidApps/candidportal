import { NextResponse } from 'next/server';
import type { Lead } from '@/components/LeadsView';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** Admin: portal-generated leads (e.g. from bill analysis uploads). */
export async function GET() {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('portal_leads')
    .select(
      'id, analysis_review_id, quote_request_id, lead_source, lifecycle, close_reason, close_note, converted_customer_id, lead_data, created_at',
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
    .map((row) => {
      const base = row.lead_data as Lead;
      if (!base || typeof base.id !== 'string') return null;
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
      } as Lead;
    })
    .filter((lead): lead is Lead => lead !== null);

  return NextResponse.json({ leads });
}
