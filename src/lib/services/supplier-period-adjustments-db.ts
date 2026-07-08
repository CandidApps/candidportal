import type {
  ReconciliationResolutionType,
  SupplierPeriodAdjustment,
} from '@/lib/commissions/supplier-reconciliation';
import type { SupplierId } from '@/lib/commissions/supplier-config';
import type { SupabaseClient } from '@supabase/supabase-js';

type AdjustmentRow = {
  id: string;
  supplier_id: string;
  period: string;
  amount: number | string;
  resolution_type: string;
  agent_merge_keys: string[] | null;
  show_on_agent_report: boolean;
  note: string;
  created_at: string;
  updated_at: string;
};

const RESOLUTION_TYPES: ReconciliationResolutionType[] = [
  'candid_revenue',
  'candid_absorb',
  'agent_charge',
  'agent_pro_rata',
  'agent_bonus',
];

function rowToAdjustment(row: AdjustmentRow): SupplierPeriodAdjustment | null {
  if (!RESOLUTION_TYPES.includes(row.resolution_type as ReconciliationResolutionType)) return null;
  return {
    id: row.id,
    supplierId: row.supplier_id as SupplierId,
    period: row.period,
    amount: typeof row.amount === 'number' ? row.amount : Number(row.amount),
    resolutionType: row.resolution_type as ReconciliationResolutionType,
    agentMergeKeys: Array.isArray(row.agent_merge_keys) ? row.agent_merge_keys : [],
    showOnAgentReport: Boolean(row.show_on_agent_report),
    note: row.note ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadSupplierPeriodAdjustments(
  admin: SupabaseClient,
  period: string,
): Promise<SupplierPeriodAdjustment[]> {
  const { data, error } = await admin
    .from('supplier_period_adjustments')
    .select('*')
    .eq('period', period);
  if (error) throw new Error(error.message);

  const out: SupplierPeriodAdjustment[] = [];
  for (const row of (data ?? []) as AdjustmentRow[]) {
    const adj = rowToAdjustment(row);
    if (adj) out.push(adj);
  }
  return out;
}

export async function upsertSupplierPeriodAdjustment(
  admin: SupabaseClient,
  payload: Omit<SupplierPeriodAdjustment, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): Promise<SupplierPeriodAdjustment> {
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    supplier_id: payload.supplierId,
    period: payload.period,
    amount: payload.amount,
    resolution_type: payload.resolutionType,
    agent_merge_keys: payload.agentMergeKeys,
    show_on_agent_report: payload.showOnAgentReport,
    note: payload.note.trim(),
    updated_at: now,
  };
  if (payload.id) row.id = payload.id;

  const { data, error } = await admin
    .from('supplier_period_adjustments')
    .upsert(row, { onConflict: 'supplier_id,period' })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  const adj = rowToAdjustment(data as AdjustmentRow);
  if (!adj) throw new Error('Invalid adjustment saved');
  return adj;
}

export async function deleteSupplierPeriodAdjustment(
  admin: SupabaseClient,
  supplierId: SupplierId,
  period: string,
): Promise<void> {
  const { error } = await admin
    .from('supplier_period_adjustments')
    .delete()
    .eq('supplier_id', supplierId)
    .eq('period', period);
  if (error) throw new Error(error.message);
}
