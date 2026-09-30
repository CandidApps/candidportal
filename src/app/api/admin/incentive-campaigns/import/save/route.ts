import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import {
  CAMPAIGN_CRITERIA_MAX,
  CAMPAIGN_DETAILS_MAX,
  CAMPAIGN_TITLE_MAX,
} from '@/lib/incentive-campaigns';
import type { SpiffSaveResult, SpiffSaveRow } from '@/lib/incentive-import/types';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 500;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clip(v: string | undefined | null, max: number): string | null {
  const s = (v ?? '').trim();
  return s ? s.slice(0, max) : null;
}

function date(v: string | undefined): string | null {
  return v && DATE_RE.test(v) ? v : null;
}

function persistFields(row: SpiffSaveRow): Record<string, unknown> {
  const title =
    clip(row.customerName, CAMPAIGN_TITLE_MAX) ??
    clip(row.internalName, CAMPAIGN_TITLE_MAX) ??
    `${row.provider} SPIFF`.slice(0, CAMPAIGN_TITLE_MAX);
  const startsOn = date(row.startsOn);
  let endsOn = date(row.endsOn);
  if (startsOn && endsOn && endsOn < startsOn) endsOn = null;
  return {
    source: 'supplier_spiff',
    title,
    details: clip(row.customerDescription, CAMPAIGN_DETAILS_MAX),
    criteria: clip(row.customerCriteria, CAMPAIGN_CRITERIA_MAX),
    structure_type: row.payoutType && row.payoutValue != null ? row.payoutType : null,
    structure_value: row.payoutType && row.payoutValue != null ? row.payoutValue : null,
    starts_on: startsOn,
    ends_on: endsOn,
    customer_facing: row.flag,
    source_program: clip(row.sourceProgram, 80),
    category: clip(row.category, 80),
    internal_name: clip(row.internalName, 300),
    internal_description: clip(row.internalDescription, 8000),
    internal_terms: clip(row.internalTerms, 8000),
    admin_notes: clip([row.flagReason, row.adminNotes].filter(Boolean).join('\n'), 4000),
    payout_raw: clip(row.payoutRaw, 300),
    payout_up_to: Boolean(row.payoutUpTo),
    min_monthly_charge: row.minMonthlyCharge,
    min_term_months: row.minTermMonths,
    payout_timeline: clip(row.payoutTimeline, 300),
    external_link: clip(row.link, 1000),
    import_key: row.importKey,
    imported_at: new Date().toISOString(),
  };
}

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { rows?: SpiffSaveRow[] };
  const rows = (body.rows ?? []).slice(0, MAX_ROWS);
  if (!rows.length) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = createSupabaseAdminClient();

  const keys = [...new Set(rows.map((r) => r.importKey).filter(Boolean))];
  const { data: existingRows, error: lookupErr } = await admin
    .from('incentive_campaigns')
    .select('id, provider_id, import_key')
    .in('import_key', keys.length ? keys : ['__none__']);
  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  const existing = new Map(
    (existingRows ?? []).map((r) => [`${r.provider_id}|${r.import_key}`, r.id as string]),
  );

  const result: SpiffSaveResult = { created: 0, updated: 0, errors: [] };
  for (const row of rows) {
    const providerDbId = Number(row.providerDbId);
    if (!Number.isFinite(providerDbId) || providerDbId <= 0) {
      result.errors.push({ rowNumber: row.rowNumber, error: 'No supplier matched.' });
      continue;
    }
    const fields = persistFields(row);
    const id = existing.get(`${providerDbId}|${row.importKey}`);
    if (id) {
      const { error } = await admin
        .from('incentive_campaigns')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) result.errors.push({ rowNumber: row.rowNumber, error: error.message });
      else result.updated += 1;
    } else {
      const { data, error } = await admin
        .from('incentive_campaigns')
        .insert({ ...fields, provider_id: providerDbId, created_by: user?.id ?? null })
        .select('id')
        .single();
      if (error) result.errors.push({ rowNumber: row.rowNumber, error: error.message });
      else {
        result.created += 1;
        existing.set(`${providerDbId}|${row.importKey}`, data.id as string);
      }
    }
  }
  return NextResponse.json(result);
}
