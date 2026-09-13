import type { SupabaseClient } from '@supabase/supabase-js';
import { slugifyProviderName } from '@/lib/solution-providers-db';
import { resolveMemberEarningsProfile, selfAgentResidualPct } from '@/lib/member-earnings-profile';
import type { BmwAgentRate } from '@/lib/bmw/types';

export type MemberCashbackLedgerStatus = 'pending' | 'earned' | 'paid';

export type MemberCashbackSummary = {
  pendingMonthly: number;
  earnedMonthly: number;
  paidMonthly: number;
  pendingCount: number;
  earnedCount: number;
  paidCount: number;
  items: MemberCashbackSummaryItem[];
};

export type MemberCashbackSummaryItem = {
  id: string;
  vendorName: string | null;
  cashbackPct: number | null;
  amountMonthly: number | null;
  basisMonthly: number | null;
  status: MemberCashbackLedgerStatus;
  createdAt: string;
  dealExternalId: string | null;
};

function slugAgentId(input: string): string {
  return (
    input
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'member'
  );
}

export function memberAgentCommIdForCustomer(customerExternalId: string): string {
  return `MEMBER-${slugAgentId(customerExternalId)}`;
}

function monthlyCashbackAmount(basis: number | null, pct: number | null): number | null {
  if (basis == null || pct == null || !Number.isFinite(basis) || !Number.isFinite(pct)) return null;
  if (basis <= 0 || pct <= 0) return null;
  return Math.round((basis * pct) / 100 * 100) / 100;
}

export async function lookupMemberCashbackPct(
  admin: SupabaseClient,
  vendorName: string | null,
): Promise<{ pct: number | null; slug: string | null; providerName: string | null }> {
  const normalized = vendorName?.trim();
  if (!normalized) return { pct: null, slug: null, providerName: null };

  const slug = slugifyProviderName(normalized);
  const { data: bySlug } = await admin
    .from('solution_providers')
    .select('slug, name, display_name, member_cashback_pct, member_earnings_profile')
    .eq('slug', slug)
    .maybeSingle();

  const pick = (row: {
    slug: string;
    name: string;
    display_name: string | null;
    member_cashback_pct: number | null;
    member_earnings_profile?: unknown;
  } | null) => {
    if (!row) return null;
    const legacy =
      row.member_cashback_pct != null && Number.isFinite(Number(row.member_cashback_pct))
        ? Number(row.member_cashback_pct)
        : null;
    const profile = resolveMemberEarningsProfile(row.member_earnings_profile, legacy);
    const pct = selfAgentResidualPct(profile) ?? (legacy != null && legacy > 0 ? legacy : null);
    if (pct == null || pct <= 0) return null;
    return {
      pct,
      slug: row.slug,
      providerName: row.display_name?.trim() || row.name,
    };
  };

  const fromSlug = pick(bySlug as typeof bySlug);
  if (fromSlug) return fromSlug;

  const { data: byName } = await admin
    .from('solution_providers')
    .select('slug, name, display_name, member_cashback_pct, member_earnings_profile')
    .ilike('name', normalized)
    .limit(1)
    .maybeSingle();
  const fromName = pick(byName as typeof byName);
  if (fromName) return fromName;

  const { data: byDisplay } = await admin
    .from('solution_providers')
    .select('slug, name, display_name, member_cashback_pct, member_earnings_profile')
    .ilike('display_name', normalized)
    .limit(1)
    .maybeSingle();
  return pick(byDisplay as typeof byDisplay) ?? { pct: null, slug: null, providerName: null };
}

export async function resolveOrCreateMemberAgent(
  admin: SupabaseClient,
  params: {
    customerExternalId: string;
    contactName: string | null;
    contactEmail: string | null;
    cashbackPct?: number | null;
  },
): Promise<string> {
  const agentCommId = memberAgentCommIdForCustomer(params.customerExternalId);
  const { data: existing } = await admin
    .from('bmw_agent_rates')
    .select('agent_comm_id')
    .eq('agent_comm_id', agentCommId)
    .maybeSingle();

  if (existing?.agent_comm_id) return agentCommId;

  const name = params.contactName?.trim() || 'Member';
  const email = params.contactEmail?.trim() || '';
  const commissionRate =
    params.cashbackPct != null && Number.isFinite(params.cashbackPct) ? params.cashbackPct : 0;

  const rateData: BmwAgentRate = {
    rowNum: 0,
    email,
    name,
    id: agentCommId,
    commissionRate,
    overridePartner: '',
    overrideRate: null,
    tempRate: null,
    tempRateEndDate: '',
    tempRateDetermine: '',
  };

  const { error } = await admin.from('bmw_agent_rates').upsert(
    {
      agent_comm_id: agentCommId,
      rate_data: rateData,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'agent_comm_id' },
  );
  if (error) throw new Error(error.message);
  return agentCommId;
}

export async function recordMemberCashbackOnQuoteAccept(
  admin: SupabaseClient,
  params: {
    customerExternalId: string;
    contractSubmitActionId: string;
    quoteRequestId?: string | null;
    vendorName: string | null;
    monthlyBasis: number | null;
    contactName: string | null;
    contactEmail: string | null;
  },
): Promise<{ ledgerId: string | null; memberAgentCommId: string | null }> {
  const lookup = await lookupMemberCashbackPct(admin, params.vendorName);
  if (lookup.pct == null || lookup.pct <= 0) {
    return { ledgerId: null, memberAgentCommId: null };
  }

  const memberAgentCommId = await resolveOrCreateMemberAgent(admin, {
    customerExternalId: params.customerExternalId,
    contactName: params.contactName,
    contactEmail: params.contactEmail,
    cashbackPct: lookup.pct,
  });

  const amountMonthly = monthlyCashbackAmount(params.monthlyBasis, lookup.pct);
  const now = new Date().toISOString();
  const actionId = params.contractSubmitActionId?.trim() || null;

  const row = {
    customer_external_id: params.customerExternalId,
    quote_request_id: params.quoteRequestId ?? null,
    contract_submit_action_id: actionId,
    vendor_name: params.vendorName?.trim() || lookup.providerName,
    provider_slug: lookup.slug,
    cashback_pct: lookup.pct,
    basis_monthly: params.monthlyBasis,
    amount_monthly: amountMonthly,
    status: 'pending' as const,
    member_agent_comm_id: memberAgentCommId,
    source: 'quote_accept',
    updated_at: now,
  };

  if (actionId) {
    const { data: existing } = await admin
      .from('member_cashback_ledger')
      .select('id')
      .eq('contract_submit_action_id', actionId)
      .maybeSingle();

    if (existing?.id) {
      const { data, error } = await admin
        .from('member_cashback_ledger')
        .update(row)
        .eq('id', existing.id)
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return { ledgerId: data?.id ? String(data.id) : null, memberAgentCommId };
    }

    const { data, error } = await admin
      .from('member_cashback_ledger')
      .insert({ ...row, created_at: now })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return { ledgerId: data?.id ? String(data.id) : null, memberAgentCommId };
  }

  const { data, error } = await admin
    .from('member_cashback_ledger')
    .insert({ ...row, created_at: now })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return { ledgerId: data?.id ? String(data.id) : null, memberAgentCommId };
}

export async function getMemberAgentForContractAction(
  admin: SupabaseClient,
  contractSubmitActionId: string,
): Promise<{
  agentCommId: string;
  agentName: string | null;
  cashbackPct: number | null;
} | null> {
  const actionId = contractSubmitActionId?.trim();
  if (!actionId) return null;

  const { data } = await admin
    .from('member_cashback_ledger')
    .select('member_agent_comm_id, cashback_pct, vendor_name')
    .eq('contract_submit_action_id', actionId)
    .maybeSingle();

  if (!data?.member_agent_comm_id) return null;

  const agentCommId = String(data.member_agent_comm_id);
  const { data: rateRow } = await admin
    .from('bmw_agent_rates')
    .select('rate_data')
    .eq('agent_comm_id', agentCommId)
    .maybeSingle();

  const rateData = rateRow?.rate_data as BmwAgentRate | undefined;
  return {
    agentCommId,
    agentName: rateData?.name?.trim() || null,
    cashbackPct:
      data.cashback_pct != null && Number.isFinite(Number(data.cashback_pct))
        ? Number(data.cashback_pct)
        : null,
  };
}

export async function finalizeMemberCashbackOnDealConvert(
  admin: SupabaseClient,
  params: {
    contractSubmitActionId: string;
    dealExternalId: string;
    monthlyBasis: number | null;
  },
): Promise<void> {
  const actionId = params.contractSubmitActionId?.trim();
  if (!actionId) return;

  const { data: ledger } = await admin
    .from('member_cashback_ledger')
    .select('*')
    .eq('contract_submit_action_id', actionId)
    .maybeSingle();

  if (!ledger?.id) return;

  const pct =
    ledger.cashback_pct != null && Number.isFinite(Number(ledger.cashback_pct))
      ? Number(ledger.cashback_pct)
      : null;
  const basis =
    params.monthlyBasis ??
    (ledger.basis_monthly != null && Number.isFinite(Number(ledger.basis_monthly))
      ? Number(ledger.basis_monthly)
      : null);
  const amountMonthly = monthlyCashbackAmount(basis, pct);

  const now = new Date().toISOString();
  await admin
    .from('member_cashback_ledger')
    .update({
      status: 'earned',
      deal_external_id: params.dealExternalId,
      basis_monthly: basis,
      amount_monthly: amountMonthly,
      updated_at: now,
    })
    .eq('id', ledger.id);

  if (!ledger.member_agent_comm_id) return;

  const agentCommId = String(ledger.member_agent_comm_id);
  const { data: dealRow } = await admin
    .from('deals')
    .select('id, contract_data')
    .eq('external_id', params.dealExternalId)
    .maybeSingle();

  if (dealRow?.id) {
    const prior =
      dealRow.contract_data && typeof dealRow.contract_data === 'object'
        ? (dealRow.contract_data as Record<string, unknown>)
        : {};
    const { data: rateRow } = await admin
      .from('bmw_agent_rates')
      .select('rate_data')
      .eq('agent_comm_id', agentCommId)
      .maybeSingle();
    const rateData = rateRow?.rate_data as BmwAgentRate | undefined;

    await admin
      .from('deals')
      .update({
        contract_data: {
          ...prior,
          agentCommId,
          agentOfRecord: rateData?.name?.trim() || prior.agentOfRecord,
          agentCommissionRate: pct ?? prior.agentCommissionRate,
        },
        updated_at: now,
      })
      .eq('id', dealRow.id);
  }
}

function mapLedgerRow(row: Record<string, unknown>): MemberCashbackSummaryItem {
  return {
    id: String(row.id),
    vendorName: (row.vendor_name as string | null) ?? null,
    cashbackPct:
      row.cashback_pct != null && Number.isFinite(Number(row.cashback_pct))
        ? Number(row.cashback_pct)
        : null,
    amountMonthly:
      row.amount_monthly != null && Number.isFinite(Number(row.amount_monthly))
        ? Number(row.amount_monthly)
        : null,
    basisMonthly:
      row.basis_monthly != null && Number.isFinite(Number(row.basis_monthly))
        ? Number(row.basis_monthly)
        : null,
    status: (row.status as MemberCashbackLedgerStatus) ?? 'pending',
    createdAt: String(row.created_at ?? ''),
    dealExternalId: (row.deal_external_id as string | null) ?? null,
  };
}

export async function getMemberCashbackSummary(
  admin: SupabaseClient,
  customerExternalId: string,
): Promise<MemberCashbackSummary> {
  const { data, error } = await admin
    .from('member_cashback_ledger')
    .select('*')
    .eq('customer_external_id', customerExternalId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Record<string, unknown>[];
  const items = rows.map(mapLedgerRow);

  let pendingMonthly = 0;
  let earnedMonthly = 0;
  let paidMonthly = 0;
  let pendingCount = 0;
  let earnedCount = 0;
  let paidCount = 0;

  for (const item of items) {
    const amt = item.amountMonthly ?? 0;
    if (item.status === 'pending') {
      pendingMonthly += amt;
      pendingCount += 1;
    } else if (item.status === 'earned') {
      earnedMonthly += amt;
      earnedCount += 1;
    } else if (item.status === 'paid') {
      paidMonthly += amt;
      paidCount += 1;
    }
  }

  return {
    pendingMonthly: Math.round(pendingMonthly * 100) / 100,
    earnedMonthly: Math.round(earnedMonthly * 100) / 100,
    paidMonthly: Math.round(paidMonthly * 100) / 100,
    pendingCount,
    earnedCount,
    paidCount,
    items,
  };
}
