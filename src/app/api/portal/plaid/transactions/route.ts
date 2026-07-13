import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { resolvePortalCustomerForRequest } from '@/lib/portal/member-customer-resolve';
import { TECH_CATEGORY_LABELS, type TechSpendCategory } from '@/lib/plaid/categorize';
import { plaidConfigured } from '@/lib/plaid/client';
import { refreshPlaidAccounts, syncPlaidItemTransactions, type PlaidItemRow } from '@/lib/plaid/sync';

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const ctx = await resolvePortalCustomerForRequest({
    email: user.email,
    customerExternalId: url.searchParams.get('customerId'),
  });
  if (!ctx) {
    return NextResponse.json({
      configured: plaidConfigured(),
      items: [],
      accounts: [],
      transactions: [],
      summary: { techTotal: 0, txnCount: 0, byCategory: [] },
    });
  }

  const admin = createSupabaseAdminClient();
  const days = Math.min(365, Math.max(7, Number(url.searchParams.get('days') ?? 90) || 90));
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const [{ data: items }, { data: accounts }, { data: transactions }] = await Promise.all([
    admin
      .from('plaid_items')
      .select(
        'id, institution_name, institution_id, status, last_synced_at, connected_at, error_message',
      )
      .eq('customer_id', ctx.customerUuid)
      .neq('status', 'removed')
      .order('connected_at', { ascending: false }),
    admin
      .from('plaid_accounts')
      .select('id, item_row_id, account_id, name, official_name, mask, type, subtype')
      .eq('customer_id', ctx.customerUuid)
      .order('name'),
    admin
      .from('plaid_transactions')
      .select(
        'id, account_id, amount, date, name, merchant_name, pending, tech_category, candid_related, matched_service_hint, iso_currency_code',
      )
      .eq('customer_id', ctx.customerUuid)
      .gte('date', sinceStr)
      .order('date', { ascending: false })
      .limit(500),
  ]);

  const techTxns = (transactions ?? []).filter((t) => t.tech_category && t.tech_category !== 'non_tech');
  const byCategoryMap = new Map<string, number>();
  let techTotal = 0;
  for (const t of techTxns) {
    const amt = Math.abs(Number(t.amount) || 0);
    techTotal += amt;
    const key = String(t.tech_category);
    byCategoryMap.set(key, (byCategoryMap.get(key) ?? 0) + amt);
  }

  const byCategory = [...byCategoryMap.entries()]
    .map(([category, total]) => ({
      category,
      label: TECH_CATEGORY_LABELS[category as TechSpendCategory] ?? category,
      total: Math.round(total * 100) / 100,
    }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({
    configured: plaidConfigured(),
    companyName: ctx.companyName,
    customerId: ctx.customerExternalId,
    days,
    items: items ?? [],
    accounts: accounts ?? [],
    transactions: transactions ?? [],
    summary: {
      techTotal: Math.round(techTotal * 100) / 100,
      txnCount: techTxns.length,
      byCategory,
    },
  });
}

export async function POST(request: Request) {
  if (!plaidConfigured()) {
    return NextResponse.json({ error: 'Plaid is not configured.' }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { itemRowId?: string; customerId?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    /* sync all */
  }

  const ctx = await resolvePortalCustomerForRequest({
    email: user.email,
    customerExternalId: body.customerId,
  });
  if (!ctx) return NextResponse.json({ error: 'No portal customer linked.' }, { status: 403 });

  const admin = createSupabaseAdminClient();
  let query = admin
    .from('plaid_items')
    .select('id, customer_id, item_id, access_token_enc, institution_name, sync_cursor, status')
    .eq('customer_id', ctx.customerUuid)
    .eq('status', 'active');
  if (body.itemRowId) query = query.eq('id', body.itemRowId);

  const { data: items, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<{ itemId: string; sync: { added: number; modified: number; removed: number }; accounts: number }> = [];
  for (const item of (items ?? []) as PlaidItemRow[]) {
    const accounts = await refreshPlaidAccounts(admin, item);
    const sync = await syncPlaidItemTransactions(admin, item);
    results.push({ itemId: item.id, sync, accounts });
  }

  return NextResponse.json({ ok: true, results });
}
