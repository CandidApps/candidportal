import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { dealKey } from '@/lib/bmw/deal-key';
import type { BmwAgentRate, BmwDeal } from '@/lib/bmw/types';

type BmwDealRow = {
  deal_data: BmwDeal;
};

type BmwAgentRateRow = {
  rate_data: BmwAgentRate;
};

export async function loadBmwDealsFromDatabase(): Promise<BmwDeal[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from('bmw_deals').select('deal_data').order('id');
  if (error) throw new Error(error.message);
  return (data as BmwDealRow[] | null)?.map((row) => row.deal_data) ?? [];
}

export async function loadBmwAgentRatesFromDatabase(): Promise<BmwAgentRate[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from('bmw_agent_rates').select('rate_data').order('id');
  if (error) throw new Error(error.message);
  return (data as BmwAgentRateRow[] | null)?.map((row) => row.rate_data) ?? [];
}

export function bmwDealExternalKey(deal: BmwDeal): string {
  const key = dealKey(deal);
  return key || `row-${deal.rowNum}`;
}
