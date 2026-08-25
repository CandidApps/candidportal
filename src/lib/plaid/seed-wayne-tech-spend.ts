import type { SupabaseClient } from '@supabase/supabase-js';
import {
  WAYNE_DEMO_ACCOUNTS,
  WAYNE_DEMO_CUSTOMER_EXTERNAL_ID,
  WAYNE_DEMO_ITEM_ID,
  WAYNE_DEMO_TOKEN,
  buildWayneDemoTransactions,
} from '@/lib/plaid/wayne-demo-seed';

export async function resolveWayneDemoCustomerId(
  admin: SupabaseClient,
  externalId = WAYNE_DEMO_CUSTOMER_EXTERNAL_ID,
): Promise<string | null> {
  const { data } = await admin
    .from('customers')
    .select('id')
    .eq('external_id', externalId)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

/**
 * Upsert flashy demo Tech Spend for Wayne Enterprises — no Plaid connection required.
 * Safe to re-run; replaces prior demo transactions for this item.
 */
export async function seedWayneTechSpendDemo(
  admin: SupabaseClient,
  opts?: { customerUuid?: string | null; now?: Date },
): Promise<{
  customerId: string;
  itemRowId: string;
  accounts: number;
  transactions: number;
}> {
  const customerId =
    opts?.customerUuid?.trim() || (await resolveWayneDemoCustomerId(admin));
  if (!customerId) {
    throw new Error(
      `Wayne demo customer not found (external_id=${WAYNE_DEMO_CUSTOMER_EXTERNAL_ID})`,
    );
  }

  const now = opts?.now ?? new Date();
  const nowIso = now.toISOString();

  const { data: item, error: itemErr } = await admin
    .from('plaid_items')
    .upsert(
      {
        customer_id: customerId,
        item_id: WAYNE_DEMO_ITEM_ID,
        access_token_enc: WAYNE_DEMO_TOKEN,
        institution_id: 'demo_chase',
        institution_name: 'Chase (Demo — Wayne Enterprises)',
        products: ['transactions'],
        status: 'active',
        sync_cursor: null,
        last_synced_at: nowIso,
        error_code: null,
        error_message: null,
        connected_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: 'item_id' },
    )
    .select('id')
    .single();

  if (itemErr || !item?.id) {
    throw new Error(itemErr?.message ?? 'Failed to upsert demo plaid item');
  }

  const itemRowId = String(item.id);

  // Replace accounts for this item
  await admin.from('plaid_accounts').delete().eq('item_row_id', itemRowId);
  const accountRows = WAYNE_DEMO_ACCOUNTS.map((a) => ({
    item_row_id: itemRowId,
    customer_id: customerId,
    account_id: a.accountId,
    name: a.name,
    official_name: a.officialName,
    mask: a.mask,
    type: a.type,
    subtype: a.subtype,
    iso_currency_code: 'USD',
    updated_at: nowIso,
  }));
  const { error: acctErr } = await admin.from('plaid_accounts').insert(accountRows);
  if (acctErr) throw new Error(acctErr.message);

  // Replace demo transactions (keep any real Plaid txns for this customer if present)
  await admin
    .from('plaid_transactions')
    .delete()
    .eq('item_row_id', itemRowId);

  const seeds = buildWayneDemoTransactions(now);
  const txnRows = seeds.map((t) => ({
    customer_id: customerId,
    item_row_id: itemRowId,
    account_id: t.accountId,
    transaction_id: t.transactionId,
    amount: t.amount,
    iso_currency_code: 'USD',
    date: t.date,
    authorized_date: t.date,
    name: t.name,
    merchant_name: t.merchantName,
    pending: Boolean(t.pending),
    plaid_category: null,
    personal_finance_category: null,
    payment_channel: 'other',
    tech_category: t.techCategory,
    candid_related: t.candidRelated,
    matched_service_hint: t.matchedServiceHint,
    raw: { demo: true, source: 'wayne-enterprises-demo' },
    updated_at: nowIso,
  }));

  // Insert in chunks
  const chunk = 80;
  for (let i = 0; i < txnRows.length; i += chunk) {
    const slice = txnRows.slice(i, i + chunk);
    const { error } = await admin.from('plaid_transactions').insert(slice);
    if (error) throw new Error(error.message);
  }

  return {
    customerId,
    itemRowId,
    accounts: accountRows.length,
    transactions: txnRows.length,
  };
}
