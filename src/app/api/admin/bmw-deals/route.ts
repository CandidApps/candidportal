import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { dealKey } from '@/lib/bmw/deal-key';
import { paySourceForSupplier } from '@/lib/bmw/pay-source-map';
import type { BmwDeal } from '@/lib/bmw/types';
import type { SupplierId } from '@/lib/commissions/supplier-config';
import { persistBmwDeal } from '@/lib/crm/persist-bmw-deal';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

type CommissionDealType = 'recurring' | 'one_time';

type Body = {
  supplier?: SupplierId;
  paySource?: string;
  dealUid?: string;
  merchant?: string;
  agentCommId?: string;
  agentName?: string;
  commissionRate?: number;
  commissionType?: CommissionDealType;
  product?: string;
  provider?: string;
  candidCommissionRate?: number;
  parentCustomerId?: string;
  parentCustomerName?: string;
  latestCommissionAmount?: number;
  /** Only update agentCommId/agentName on an existing row; create the row only if missing. */
  agentOnly?: boolean;
};

/** Commission partners pay on behalf of many suppliers — never a provider name. */
const PARTNER_PAY_SOURCES = new Set(['appdirect', 'intelisys', 'telarus', 'sandler', 'sandler partners']);

/** Direct suppliers whose pay source name differs from the supplier record name. */
const PAY_SOURCE_SUPPLIER_ALIASES: Record<string, string> = {
  mango: 'Mango Voice',
};

async function providerForPaySource(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  paySource: string,
): Promise<string> {
  const key = paySource.trim().toLowerCase();
  if (!key || PARTNER_PAY_SOURCES.has(key)) return '';
  const wanted = PAY_SOURCE_SUPPLIER_ALIASES[key] ?? paySource.trim();
  const { data } = await admin
    .from('solution_providers')
    .select('name')
    .ilike('name', wanted)
    .limit(2);
  return data?.length === 1 ? String(data[0].name) : '';
}

function resolvePaySource(body: Body): string {
  return body.paySource?.trim() || (body.supplier ? paySourceForSupplier(body.supplier) : '');
}

function toBmwDeal(
  body: Required<Pick<Body, 'dealUid' | 'merchant' | 'agentCommId'>> & Body,
  provider: string,
): BmwDeal {
  const paySource = resolvePaySource(body);
  return {
    rowNum: 0,
    paySource,
    dealUid: body.dealUid.trim(),
    agentCommId: body.agentCommId.trim(),
    merchant: body.merchant.trim(),
    provider,
    product: body.product?.trim() || '',
    providerAccount: '',
    uidHeader: '',
    sandlerDealId: '',
    serviceDescription: '',
    rate: body.candidCommissionRate != null ? body.candidCommissionRate / 100 : null,
    contractMrc: null,
    activeDeal: true,
    status: 'Active',
    street: '',
    city: '',
    state: '',
    zip: '',
    agentName: body.agentName?.trim() || body.agentCommId.trim(),
    customerId: body.parentCustomerId?.trim() || '',
    customerContactName: '',
    agentId: '',
    serviceId: '',
    uuid: '',
    cloverId: '',
  };
}

export async function POST(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.dealUid?.trim() || !body.merchant?.trim()) {
    return NextResponse.json({ error: 'dealUid and merchant are required' }, { status: 400 });
  }
  if (!body.supplier && !body.paySource?.trim()) {
    return NextResponse.json({ error: 'supplier or paySource is required' }, { status: 400 });
  }
  if (!body.agentCommId?.trim()) {
    return NextResponse.json({ error: 'agentCommId is required' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();

    if (body.agentOnly) {
      const externalKey = dealKey({ paySource: resolvePaySource(body), dealUid: body.dealUid });
      const { data: existing, error: lookupError } = await admin
        .from('bmw_deals')
        .select('deal_data')
        .eq('external_key', externalKey)
        .maybeSingle();
      if (lookupError) throw new Error(lookupError.message);
      if (existing?.deal_data) {
        const agentCommId = body.agentCommId.trim();
        const next: BmwDeal = {
          ...(existing.deal_data as BmwDeal),
          agentCommId,
          agentName: body.agentName?.trim() || agentCommId,
        };
        const { error: updateError } = await admin
          .from('bmw_deals')
          .update({ agent_comm_id: agentCommId, deal_data: next, updated_at: new Date().toISOString() })
          .eq('external_key', externalKey);
        if (updateError) throw new Error(updateError.message);
        return NextResponse.json({ ok: true, deal: next, customerExternalId: '', customerCreated: false });
      }
    }

    const provider =
      body.provider?.trim() || (await providerForPaySource(admin, resolvePaySource(body)));
    const deal = toBmwDeal(
      { ...body, dealUid: body.dealUid, merchant: body.merchant, agentCommId: body.agentCommId },
      provider,
    );
    const result = await persistBmwDeal(admin, deal, {
      parentCustomerId: body.parentCustomerId,
    });
    return NextResponse.json({
      ok: true,
      deal: result.deal,
      customerExternalId: result.customerExternalId,
      customerCreated: result.customerCreated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save deal';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
