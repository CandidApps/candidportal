import type { SupabaseClient } from '@supabase/supabase-js';
import type { Transaction, RemovedTransaction } from 'plaid';
import { decryptSecret, encryptSecret } from '@/lib/email/crypto';
import { classifyTechSpend } from '@/lib/plaid/categorize';
import { getPlaidClient } from '@/lib/plaid/client';

export type PlaidItemRow = {
  id: string;
  customer_id: string;
  item_id: string;
  access_token_enc: string;
  institution_name: string | null;
  sync_cursor: string | null;
  status: string;
};

function mapTransaction(
  customerId: string,
  itemRowId: string,
  tx: Transaction,
) {
  const { techCategory, candidHint } = classifyTechSpend({
    name: tx.name,
    merchantName: tx.merchant_name,
    plaidCategory: tx.category ?? null,
    personalFinanceCategory: tx.personal_finance_category
      ? {
          primary: tx.personal_finance_category.primary,
          detailed: tx.personal_finance_category.detailed,
        }
      : null,
  });

  return {
    customer_id: customerId,
    item_row_id: itemRowId,
    account_id: tx.account_id,
    transaction_id: tx.transaction_id,
    amount: tx.amount,
    iso_currency_code: tx.iso_currency_code ?? tx.unofficial_currency_code ?? 'USD',
    date: tx.date,
    authorized_date: tx.authorized_date ?? null,
    name: tx.name ?? null,
    merchant_name: tx.merchant_name ?? null,
    pending: Boolean(tx.pending),
    plaid_category: tx.category ?? null,
    personal_finance_category: tx.personal_finance_category ?? null,
    payment_channel: tx.payment_channel ?? null,
    tech_category: techCategory,
    candid_related: techCategory !== 'non_tech',
    matched_service_hint: candidHint,
    raw: tx as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  };
}

export async function syncPlaidItemTransactions(
  admin: SupabaseClient,
  item: PlaidItemRow,
): Promise<{ added: number; modified: number; removed: number }> {
  const client = getPlaidClient();
  const accessToken = decryptSecret(item.access_token_enc);
  let cursor = item.sync_cursor ?? undefined;
  let added = 0;
  let modified = 0;
  let removed = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await client.transactionsSync({
      access_token: accessToken,
      cursor,
      count: 500,
    });
    const data = response.data;

    const upserts = [
      ...data.added.map((tx) => mapTransaction(item.customer_id, item.id, tx)),
      ...data.modified.map((tx) => mapTransaction(item.customer_id, item.id, tx)),
    ];

    if (upserts.length) {
      const { error } = await admin
        .from('plaid_transactions')
        .upsert(upserts, { onConflict: 'transaction_id' });
      if (error) throw new Error(error.message);
    }

    added += data.added.length;
    modified += data.modified.length;

    const removedIds = (data.removed as RemovedTransaction[])
      .map((r) => r.transaction_id)
      .filter(Boolean);
    if (removedIds.length) {
      const { error } = await admin
        .from('plaid_transactions')
        .delete()
        .in('transaction_id', removedIds);
      if (error) throw new Error(error.message);
      removed += removedIds.length;
    }

    hasMore = data.has_more;
    cursor = data.next_cursor;
  }

  const { error: updateError } = await admin
    .from('plaid_items')
    .update({
      sync_cursor: cursor ?? null,
      last_synced_at: new Date().toISOString(),
      status: 'active',
      error_code: null,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', item.id);
  if (updateError) throw new Error(updateError.message);

  return { added, modified, removed };
}

export async function refreshPlaidAccounts(
  admin: SupabaseClient,
  item: PlaidItemRow,
): Promise<number> {
  const client = getPlaidClient();
  const accessToken = decryptSecret(item.access_token_enc);
  const response = await client.accountsGet({ access_token: accessToken });
  const rows = response.data.accounts.map((account) => ({
    item_row_id: item.id,
    customer_id: item.customer_id,
    account_id: account.account_id,
    name: account.name ?? null,
    official_name: account.official_name ?? null,
    mask: account.mask ?? null,
    type: account.type ?? null,
    subtype: account.subtype ?? null,
    iso_currency_code: account.balances.iso_currency_code ?? 'USD',
    updated_at: new Date().toISOString(),
  }));

  if (!rows.length) return 0;
  const { error } = await admin
    .from('plaid_accounts')
    .upsert(rows, { onConflict: 'item_row_id,account_id' });
  if (error) throw new Error(error.message);
  return rows.length;
}

export { encryptSecret, decryptSecret };
