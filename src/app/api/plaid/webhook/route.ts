import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getPlaidClient, plaidConfigured } from '@/lib/plaid/client';
import { syncPlaidItemTransactions, type PlaidItemRow } from '@/lib/plaid/sync';

/**
 * Plaid webhooks. Configure in Plaid dashboard:
 * https://<host>/api/plaid/webhook
 */
export async function POST(request: Request) {
  if (!plaidConfigured()) {
    return NextResponse.json({ error: 'Plaid not configured' }, { status: 503 });
  }

  let body: {
    webhook_type?: string;
    webhook_code?: string;
    item_id?: string;
    error?: { error_code?: string; error_message?: string } | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const itemId = body.item_id?.trim();
  if (!itemId) return NextResponse.json({ ok: true, ignored: true });

  const admin = createSupabaseAdminClient();
  const { data: item, error } = await admin
    .from('plaid_items')
    .select('id, customer_id, item_id, access_token_enc, institution_name, sync_cursor, status')
    .eq('item_id', itemId)
    .maybeSingle();

  if (error || !item) {
    return NextResponse.json({ ok: true, missing: true });
  }

  const webhookType = body.webhook_type ?? '';
  const code = body.webhook_code ?? '';

  if (webhookType === 'ITEM' && (code === 'ERROR' || code === 'PENDING_EXPIRATION' || code === 'LOGIN_REPAIRED')) {
    const status = code === 'ERROR' || code === 'PENDING_EXPIRATION' ? 'login_required' : 'active';
    await admin
      .from('plaid_items')
      .update({
        status,
        error_code: body.error?.error_code ?? null,
        error_message: body.error?.error_message ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id);
    return NextResponse.json({ ok: true, status });
  }

  if (webhookType === 'TRANSACTIONS' && (code === 'SYNC_UPDATES_AVAILABLE' || code === 'DEFAULT_UPDATE' || code === 'INITIAL_UPDATE')) {
    try {
      const sync = await syncPlaidItemTransactions(admin, item as PlaidItemRow);
      return NextResponse.json({ ok: true, sync });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'sync failed';
      await admin
        .from('plaid_items')
        .update({
          status: 'error',
          error_message: message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Touch item to confirm webhook delivery path works.
  void getPlaidClient();
  return NextResponse.json({ ok: true, ignored: true, webhookType, code });
}
