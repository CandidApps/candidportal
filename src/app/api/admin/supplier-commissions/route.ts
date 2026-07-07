import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { fetchAllSupplierCommissionBatches } from '@/lib/services/supplier-commissions-core';
import { mergeDbManualImportsIntoBatches } from '@/lib/services/manual-commission-imports-db';

export async function GET() {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  const result = await fetchAllSupplierCommissionBatches(async (table) => {
    const { data, error } = await admin.from(table).select('*');
    return {
      data: (data ?? []) as Record<string, unknown>[],
      error: error?.message ?? null,
    };
  });

  try {
    result.batches = await mergeDbManualImportsIntoBatches(admin, result.batches);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load manual commission imports';
    result.errors.push({ supplier: 'manual', table: 'manual_commission_imports', message });
  }

  return NextResponse.json(result);
}
