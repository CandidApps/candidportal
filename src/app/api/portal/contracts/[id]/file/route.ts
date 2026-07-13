import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { resolvePortalCustomerForRequest } from '@/lib/portal/member-customer-resolve';
import { loadPendingContractForCustomer } from '@/lib/services/member-pending-contracts';
import { createContractSignedUrl } from '@/lib/quotes/persist-supplier-contract';

export const dynamic = 'force-dynamic';

/**
 * Member open/download for a contract awaiting signature.
 * Redirects to storage signed URL or normalized external link.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const url = new URL(request.url);
  const ctx = await resolvePortalCustomerForRequest({
    email: user.email,
    customerExternalId: url.searchParams.get('customerId'),
  });
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const action = await loadPendingContractForCustomer(id, ctx);
  if (!action) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (
    action.status !== 'customer_contract_sent' &&
    action.status !== 'customer_contract_signed'
  ) {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }

  const storagePath = action.contract_storage_path?.trim();
  if (storagePath) {
    const signed = await createContractSignedUrl(storagePath);
    if (!signed) {
      return NextResponse.json({ error: 'Could not open contract file' }, { status: 500 });
    }
    return NextResponse.redirect(signed);
  }

  const raw = action.contract_url?.trim();
  if (raw) {
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return NextResponse.redirect(href);
  }

  return NextResponse.json({ error: 'No contract file or link on this deal' }, { status: 404 });
}
