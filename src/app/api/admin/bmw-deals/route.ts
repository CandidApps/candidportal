import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
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
};

function toBmwDeal(body: Required<Pick<Body, 'dealUid' | 'merchant' | 'agentCommId'>> & Body): BmwDeal {
  const paySource =
    body.paySource?.trim() || (body.supplier ? paySourceForSupplier(body.supplier) : '');
  const provider =
    body.provider?.trim() || paySource;
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

  const deal = toBmwDeal({
    ...body,
    dealUid: body.dealUid,
    merchant: body.merchant,
    agentCommId: body.agentCommId,
  });

  try {
    const admin = createSupabaseAdminClient();
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
