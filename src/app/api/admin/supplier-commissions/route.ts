import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  fetchAllSupplierCommissionBatches,
  normalizeCommissionPeriod,
} from '@/lib/services/supplier-commissions-core';
import { applyCommissionPeriodDbFilter } from '@/lib/commissions/supplier-period-db-filter';
import { RECURRING_SUPPLIER_IDS } from '@/lib/commissions/recurring-supplier-projections';
import type { SupplierId } from '@/lib/commissions/supplier-config';
import { mergeDbManualImportsIntoBatches } from '@/lib/services/manual-commission-imports-db';

function parsePeriods(searchParams: URLSearchParams): string[] | undefined {
  const raw = searchParams.get('periods')?.trim();
  if (!raw) return undefined;
  const periods = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => /^\d{4}-\d{2}$/.test(p));
  return periods.length ? periods : undefined;
}

export async function GET(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const periods = parsePeriods(searchParams);
  const summariesOnly = searchParams.get('summariesOnly') === '1';

  const admin = createSupabaseAdminClient();

  const result = await fetchAllSupplierCommissionBatches(async (config) => {
    const isRecurring = (RECURRING_SUPPLIER_IDS as SupplierId[]).includes(config.id);
    let query = admin.from(config.table).select('*');

    if (periods?.length && !isRecurring) {
      query = applyCommissionPeriodDbFilter(query, config, periods);
    }

    const { data, error } = await query;
    let rows = (data ?? []) as Record<string, unknown>[];

    if (periods?.length && !isRecurring && !config.periodFields.includes('period') && !config.periodFields.includes('Period')) {
      const allowed = new Set(periods);
      rows = rows.filter((row) => {
        for (const field of config.periodFields) {
          const normalized = normalizeCommissionPeriod(row[field]);
          if (normalized && allowed.has(normalized)) return true;
        }
        return false;
      });
    }

    return {
      data: rows,
      error: error?.message ?? null,
    };
  }, { periods, summariesOnly });

  try {
    result.batches = await mergeDbManualImportsIntoBatches(admin, result.batches);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load manual commission imports';
    result.errors.push({ supplier: 'manual', table: 'manual_commission_imports', message });
  }

  return NextResponse.json(result);
}
