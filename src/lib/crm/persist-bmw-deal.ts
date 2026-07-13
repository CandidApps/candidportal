import type { SupabaseClient } from '@supabase/supabase-js';
import { dealKey, normalizeUid } from '@/lib/bmw/deal-key';
import type { BmwDeal } from '@/lib/bmw/types';

export type PersistBmwDealResult = {
  deal: BmwDeal;
  customerExternalId: string;
  customerCreated: boolean;
};

function slugId(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'customer'
  );
}

/** Mirrors bmwCustomerIdForDeal without importing client deal-master modules. */
function customerExternalIdForDeal(deal: BmwDeal): string {
  const merchant = deal.merchant.trim();
  if (!merchant) return '';
  return `bmw-${slugId(`merchant:${merchant.toLowerCase()}`)}`;
}

function bmwDealExternalKey(deal: BmwDeal): string {
  const key = dealKey(deal);
  return key || `row-${deal.rowNum}`;
}

/**
 * Upsert a BMW deal master row and ensure an Accounts customer exists for it
 * (unless the deal is attached to an existing parent customer).
 */
export async function persistBmwDeal(
  admin: SupabaseClient,
  deal: BmwDeal,
  opts?: { parentCustomerId?: string | null },
): Promise<PersistBmwDealResult> {
  if (!deal.dealUid?.trim() || !deal.paySource?.trim()) {
    throw new Error('Deal UID and pay source are required.');
  }
  if (!normalizeUid(deal.dealUid)) {
    throw new Error('Deal UID is required.');
  }

  const externalKey = bmwDealExternalKey(deal);

  const { error: dealError } = await admin.from('bmw_deals').upsert(
    {
      external_key: externalKey,
      deal_uid: deal.dealUid || null,
      merchant: deal.merchant || null,
      pay_source: deal.paySource || null,
      agent_comm_id: deal.agentCommId || null,
      deal_data: deal,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'external_key' },
  );
  if (dealError) throw new Error(dealError.message);

  const parentId = opts?.parentCustomerId?.trim() || deal.customerId?.trim() || '';
  if (parentId) {
    const { data: parent, error: parentError } = await admin
      .from('customers')
      .select('external_id')
      .eq('external_id', parentId)
      .maybeSingle();
    if (parentError) throw new Error(parentError.message);
    if (parent?.external_id) {
      return { deal, customerExternalId: parent.external_id, customerCreated: false };
    }
  }

  const customerExternalId = customerExternalIdForDeal(deal);
  if (!customerExternalId) {
    throw new Error('Merchant name is required to create an account.');
  }

  const { data: existing, error: existingError } = await admin
    .from('customers')
    .select('external_id')
    .eq('external_id', customerExternalId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  if (existing?.external_id) {
    return { deal, customerExternalId, customerCreated: false };
  }

  const { error: customerError } = await admin.from('customers').insert({
    external_id: customerExternalId,
    company: deal.merchant.trim(),
    company_legal: deal.merchant.trim(),
    status: 'active',
    agent: deal.agentName?.trim() || 'Unassigned',
    spend: 0,
    savings: 0,
    contracts_count: 1,
    files_count: 0,
    since_label: new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' }),
    bmw_merchant_name: deal.merchant.trim(),
  });
  if (customerError) throw new Error(customerError.message);

  return { deal, customerExternalId, customerCreated: true };
}
