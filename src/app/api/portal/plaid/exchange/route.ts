import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { resolvePortalCustomerForRequest } from '@/lib/portal/member-customer-resolve';
import { getPlaidClient, plaidConfigured } from '@/lib/plaid/client';
import { encryptSecret, refreshPlaidAccounts, syncPlaidItemTransactions } from '@/lib/plaid/sync';

export async function POST(request: Request) {
  if (!plaidConfigured()) {
    return NextResponse.json({ error: 'Plaid is not configured.' }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    publicToken?: string;
    customerId?: string;
    institution?: { institution_id?: string; name?: string };
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ctx = await resolvePortalCustomerForRequest({
    email: user.email,
    customerExternalId: body.customerId,
  });
  if (!ctx) {
    return NextResponse.json({ error: 'No portal customer linked.' }, { status: 403 });
  }

  if (!body.publicToken?.trim()) {
    return NextResponse.json({ error: 'publicToken is required' }, { status: 400 });
  }

  try {
    const client = getPlaidClient();
    const exchanged = await client.itemPublicTokenExchange({
      public_token: body.publicToken.trim(),
    });
    const accessToken = exchanged.data.access_token;
    const itemId = exchanged.data.item_id;

    const admin = createSupabaseAdminClient();
    const { data: itemRow, error: insertError } = await admin
      .from('plaid_items')
      .upsert(
        {
          customer_id: ctx.customerUuid,
          connected_by_user_id: user.id,
          item_id: itemId,
          access_token_enc: encryptSecret(accessToken),
          institution_id: body.institution?.institution_id ?? null,
          institution_name: body.institution?.name ?? null,
          products: ['transactions'],
          status: 'active',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'item_id' },
      )
      .select('id, customer_id, item_id, access_token_enc, institution_name, sync_cursor, status')
      .single();

    if (insertError || !itemRow) {
      throw new Error(insertError?.message ?? 'Failed to save Plaid item');
    }

    const accounts = await refreshPlaidAccounts(admin, itemRow);
    let sync = { added: 0, modified: 0, removed: 0 };
    try {
      sync = await syncPlaidItemTransactions(admin, itemRow);
    } catch {
      // Initial sync can lag right after Link; item is still connected.
    }

    return NextResponse.json({
      ok: true,
      itemId: itemRow.id,
      institutionName: itemRow.institution_name,
      accounts,
      sync,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not connect account';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
