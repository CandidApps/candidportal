import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { canonicalPaySource, commissionSourceKey } from '@/lib/commission-partners';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const importId = searchParams.get('importId');
  const period = searchParams.get('period');
  const admin = createSupabaseAdminClient();

  if (period) {
    const { data, error } = await admin
      .from('bank_deposit_lines')
      .select('supplier_key, source_match_label, amount')
      .eq('commission_period', period);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Keyed by supplier_key when matched, otherwise by source label so
    // deposit-only sources (no commission import) still show up.
    const totals: Record<string, { total: number; label: string }> = {};
    for (const row of data ?? []) {
      const supplierKey = row.supplier_key as string | null;
      const label = (row.source_match_label as string | null)?.trim() || null;
      const raw = supplierKey ?? label;
      if (!raw) continue;
      const key = commissionSourceKey(raw);
      const displayLabel = canonicalPaySource(raw);
      const amount = Number(row.amount) || 0;
      const entry = totals[key] ?? { total: 0, label: displayLabel };
      entry.total = Math.round((entry.total + amount) * 100) / 100;
      totals[key] = entry;
    }

    return NextResponse.json(totals);
  }

  if (importId) {
    const { data, error } = await admin
      .from('bank_deposit_lines')
      .select('*')
      .eq('import_id', Number(importId))
      .order('line_index');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data ?? []);
  }

  const { data, error } = await admin
    .from('bank_deposit_imports')
    .select('id, filename, period_start, period_end, row_count, imported_at')
    .order('imported_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as {
    filename?: string;
    periodStart?: string | null;
    periodEnd?: string | null;
    lines?: Array<{
      lineIndex: number;
      details: string | null;
      postingDate: string;
      description: string;
      amount: number;
      depositType: string;
      partnerId: number | null;
      supplierKey: string | null;
      sourceMatchLabel: string;
      origCoName: string | null;
      origId: string | null;
      commissionPeriod: string | null;
      supplierCommissionAmount: number | null;
      matchStatus: string;
      variance: number | null;
    }>;
  };

  if (!body.filename?.trim() || !body.lines?.length) {
    return NextResponse.json({ error: 'filename and lines are required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: importRow, error: importError } = await admin
    .from('bank_deposit_imports')
    .insert({
      filename: body.filename.trim(),
      period_start: body.periodStart ?? null,
      period_end: body.periodEnd ?? null,
      row_count: body.lines.length,
    })
    .select('id')
    .single();

  if (importError || !importRow) {
    return NextResponse.json({ error: importError?.message ?? 'Import failed' }, { status: 500 });
  }

  const lineRows = body.lines.map((line) => ({
    import_id: importRow.id,
    line_index: line.lineIndex,
    details: line.details,
    posting_date: line.postingDate,
    description: line.description,
    amount: line.amount,
    deposit_type: line.depositType,
    partner_supplier_id: line.partnerId,
    supplier_key: line.supplierKey,
    source_match_label: line.sourceMatchLabel,
    orig_co_name: line.origCoName,
    orig_id: line.origId,
    commission_period: line.commissionPeriod,
    supplier_commission_amount: line.supplierCommissionAmount,
    match_status: line.matchStatus,
    variance: line.variance,
  }));

  const { error: linesError } = await admin.from('bank_deposit_lines').insert(lineRows);

  if (linesError) {
    await admin.from('bank_deposit_imports').delete().eq('id', importRow.id);
    return NextResponse.json({ error: linesError.message }, { status: 500 });
  }

  return NextResponse.json({ id: importRow.id });
}
