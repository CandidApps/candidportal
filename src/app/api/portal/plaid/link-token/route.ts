import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { resolvePortalCustomerForRequest } from '@/lib/portal/member-customer-resolve';
import { getPlaidClient, plaidConfigured, PLAID_COUNTRY_CODES, PLAID_PRODUCTS } from '@/lib/plaid/client';

export async function POST(request: Request) {
  if (!plaidConfigured()) {
    return NextResponse.json(
      { error: 'Plaid is not configured on this environment.' },
      { status: 503 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let customerExternalId: string | null = null;
  try {
    const body = (await request.json()) as { customerId?: string };
    customerExternalId = body.customerId?.trim() || null;
  } catch {
    /* no body */
  }

  const ctx = await resolvePortalCustomerForRequest({
    email: user.email,
    customerExternalId,
  });
  if (!ctx) {
    return NextResponse.json(
      {
        error:
          'No portal customer is linked to this login. Exit and use Login as customer again, or enable portal access on a contact for this account.',
      },
      { status: 403 },
    );
  }

  try {
    const client = getPlaidClient();
    const redirectUri = process.env.PLAID_REDIRECT_URI?.trim() || undefined;
    const response = await client.linkTokenCreate({
      user: { client_user_id: ctx.customerUuid },
      client_name: 'Candid Portal',
      products: PLAID_PRODUCTS,
      country_codes: PLAID_COUNTRY_CODES,
      language: 'en',
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    });

    return NextResponse.json({
      linkToken: response.data.link_token,
      expiration: response.data.expiration,
      companyName: ctx.companyName,
      customerId: ctx.customerExternalId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create Plaid Link token';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
