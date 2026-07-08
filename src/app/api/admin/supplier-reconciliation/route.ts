import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import type { ReconciliationResolutionType } from '@/lib/commissions/supplier-reconciliation';
import {
  validateReconciliationPayload,
  SHORTFALL_RESOLUTIONS,
  OVERAGE_RESOLUTIONS,
} from '@/lib/commissions/supplier-reconciliation';
import { SUPPLIER_IDS, type SupplierId } from '@/lib/commissions/supplier-config';
import {
  deleteSupplierPeriodAdjustment,
  loadSupplierPeriodAdjustments,
  upsertSupplierPeriodAdjustment,
} from '@/lib/services/supplier-period-adjustments-db';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const ALL_RESOLUTIONS = [...SHORTFALL_RESOLUTIONS, ...OVERAGE_RESOLUTIONS];

function parseBody(body: unknown): {
  id?: string;
  supplierId: SupplierId;
  period: string;
  amount: number;
  resolutionType: ReconciliationResolutionType;
  agentMergeKeys: string[];
  showOnAgentReport: boolean;
  note: string;
} | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;

  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : undefined;
  const supplierId = typeof raw.supplierId === 'string' ? raw.supplierId.trim() : '';
  const period = typeof raw.period === 'string' ? raw.period.trim() : '';
  const amount = typeof raw.amount === 'number' ? raw.amount : Number(raw.amount);
  const resolutionType = typeof raw.resolutionType === 'string' ? raw.resolutionType.trim() : '';
  const note = typeof raw.note === 'string' ? raw.note : '';
  const showOnAgentReport = Boolean(raw.showOnAgentReport);

  if (!(SUPPLIER_IDS as string[]).includes(supplierId)) return null;
  if (!/^\d{4}-\d{2}$/.test(period)) return null;
  if (!Number.isFinite(amount)) return null;
  if (!(ALL_RESOLUTIONS as string[]).includes(resolutionType)) return null;

  const agentMergeKeys = Array.isArray(raw.agentMergeKeys)
    ? raw.agentMergeKeys.filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
    : [];

  return {
    id,
    supplierId: supplierId as SupplierId,
    period,
    amount: Math.round(amount * 100) / 100,
    resolutionType: resolutionType as ReconciliationResolutionType,
    agentMergeKeys,
    showOnAgentReport,
    note,
  };
}

export async function GET(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period')?.trim() ?? '';
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: 'period query param required (YYYY-MM)' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const adjustments = await loadSupplierPeriodAdjustments(admin, period);
    return NextResponse.json({ adjustments });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load reconciliation adjustments';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = parseBody(body);
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid reconciliation payload' }, { status: 400 });
  }

  const validationError = validateReconciliationPayload(parsed);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const adjustment = await upsertSupplierPeriodAdjustment(admin, parsed);
    return NextResponse.json({ ok: true, adjustment });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save reconciliation adjustment';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const supplierId = searchParams.get('supplierId')?.trim() ?? '';
  const period = searchParams.get('period')?.trim() ?? '';

  if (!(SUPPLIER_IDS as string[]).includes(supplierId) || !/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: 'supplierId and period required' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    await deleteSupplierPeriodAdjustment(admin, supplierId as SupplierId, period);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete reconciliation adjustment';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
