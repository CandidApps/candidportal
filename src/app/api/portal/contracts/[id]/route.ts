import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { resolvePortalCustomerForRequest } from '@/lib/portal/member-customer-resolve';
import { loadPendingContractForCustomer } from '@/lib/services/member-pending-contracts';
import { advanceContractDealStage } from '@/lib/services/deal-activity';
import { mapContractSubmitActionRow } from '@/lib/services/contract-submit-actions';

export const dynamic = 'force-dynamic';

/** Customer confirms they signed the contract awaiting their signature. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  let customerExternalId: string | null = null;
  try {
    const body = (await request.json()) as { customerId?: string; op?: string };
    customerExternalId = body.customerId?.trim() || null;
    if (body.op && body.op !== 'confirm_signed') {
      return NextResponse.json({ error: 'Unsupported op' }, { status: 400 });
    }
  } catch {
    /* empty body ok */
  }

  const ctx = await resolvePortalCustomerForRequest({
    email: user.email,
    customerExternalId,
  });
  if (!ctx) return NextResponse.json({ error: 'No portal customer linked.' }, { status: 403 });

  const existing = await loadPendingContractForCustomer(id, ctx);
  if (!existing) return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
  if (existing.status !== 'customer_contract_sent') {
    return NextResponse.json(
      { error: 'This contract is not awaiting your signature.' },
      { status: 409 },
    );
  }

  const result = await advanceContractDealStage({
    actionId: id,
    toStatus: 'customer_contract_signed',
    createdBy: user.id,
    payload: {
      note: 'Customer confirmed contract signed in portal',
      source: 'member_portal',
    },
  });
  if (result.error || !result.action) {
    return NextResponse.json({ error: result.error ?? 'Update failed' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    action: mapContractSubmitActionRow(result.action),
  });
}
