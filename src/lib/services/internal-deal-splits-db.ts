import { normalizeUid } from '@/lib/bmw/deal-key';
import type { SupabaseClient } from '@supabase/supabase-js';

export type PartnerSplitShare = {
  profileId: string;
  percent: number;
};

export type DealEmployeeSplit = {
  profileId: string;
  percent: number;
};

export type InternalDealSplit = {
  dealUid: string;
  label: string | null;
  partnerSplits: PartnerSplitShare[];
  employeeSplits: DealEmployeeSplit[];
  updatedAt: string | null;
};

type Row = {
  deal_uid: string;
  label: string | null;
  partner_splits: unknown;
  employee_splits: unknown;
  updated_at: string;
};

function parsePartnerSplits(raw: unknown): PartnerSplitShare[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const profileId = typeof row.profileId === 'string' ? row.profileId.trim() : '';
      const percent = typeof row.percent === 'number' ? row.percent : Number(row.percent);
      if (!profileId || !Number.isFinite(percent)) return null;
      return { profileId, percent };
    })
    .filter((s): s is PartnerSplitShare => s != null);
}

function parseEmployeeSplits(raw: unknown): DealEmployeeSplit[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const profileId = typeof row.profileId === 'string' ? row.profileId.trim() : '';
      const percent = typeof row.percent === 'number' ? row.percent : Number(row.percent);
      if (!profileId || !Number.isFinite(percent)) return null;
      return { profileId, percent };
    })
    .filter((s): s is DealEmployeeSplit => s != null);
}

function rowToSplit(row: Row): InternalDealSplit {
  return {
    dealUid: row.deal_uid,
    label: row.label,
    partnerSplits: parsePartnerSplits(row.partner_splits),
    employeeSplits: parseEmployeeSplits(row.employee_splits),
    updatedAt: row.updated_at,
  };
}

export function normalizeDealUid(dealUid: string): string {
  return normalizeUid(dealUid);
}

export async function loadInternalDealSplits(
  admin: SupabaseClient,
): Promise<InternalDealSplit[]> {
  const { data, error } = await admin.from('internal_deal_splits').select('*');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(rowToSplit);
}

export async function upsertInternalDealSplit(
  admin: SupabaseClient,
  split: {
    dealUid: string;
    label?: string | null;
    partnerSplits: PartnerSplitShare[];
    employeeSplits: DealEmployeeSplit[];
  },
): Promise<void> {
  const deal_uid = normalizeDealUid(split.dealUid);
  if (!deal_uid) throw new Error('dealUid is required');

  const { error } = await admin.from('internal_deal_splits').upsert(
    {
      deal_uid,
      label: split.label ?? null,
      partner_splits: split.partnerSplits,
      employee_splits: split.employeeSplits,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'deal_uid' },
  );
  if (error) throw new Error(error.message);
}

export async function deleteInternalDealSplit(
  admin: SupabaseClient,
  dealUid: string,
): Promise<void> {
  const deal_uid = normalizeDealUid(dealUid);
  if (!deal_uid) throw new Error('dealUid is required');

  const { error } = await admin.from('internal_deal_splits').delete().eq('deal_uid', deal_uid);
  if (error) throw new Error(error.message);
}
