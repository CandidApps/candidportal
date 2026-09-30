import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CandidContractRecord } from '@/lib/customer-records';
import { formatMemberEarningsBadge, resolveMemberEarningsProfile } from '@/lib/member-earnings-profile';
import { lookupMemberCashbackPct, resolveOrCreateMemberAgent } from '@/lib/services/member-cashback';

export const REFERRAL_FOLLOW_UP_DELAY_MS = 24 * 60 * 60 * 1000;

export type ReferralResponse = 'signed_up' | 'not_yet' | 'no';

export type ReferralProvider = {
  id: number;
  name: string;
  website: string | null;
  logoUrl: string | null;
  referralUrl: string;
  referralTermsUrl: string | null;
  referralSubidParam: string | null;
  /** Member-facing cash-back headline, e.g. "2.5% cash back". */
  cashBack: string | null;
};

export type PendingReferralFollowUp = {
  clickId: string;
  providerId: number;
  supplierName: string;
  supplierWebsite?: string;
  supplierLogoUrl?: string;
  clickedAt: string;
  /** True once 24h have passed (and any "Not yet" was 24h+ ago) — show the popup. */
  due: boolean;
};

export function newTrackingId(): string {
  return `cnd${randomBytes(8).toString('hex')}`;
}

export function buildReferralUrl(base: string, subidParam: string | null, trackingId: string): string {
  if (!subidParam) return base;
  try {
    const url = new URL(base);
    url.searchParams.set(subidParam, trackingId);
    return url.toString();
  } catch {
    return base;
  }
}

export async function loadReferralProvider(
  admin: SupabaseClient,
  providerId: number,
): Promise<ReferralProvider | null> {
  const { data } = await admin.from('solution_providers').select('*').eq('id', providerId).maybeSingle();
  if (!data || data.member_buy_mode !== 'referral' || !data.referral_url) return null;
  const legacy =
    data.member_cashback_pct != null && Number.isFinite(Number(data.member_cashback_pct))
      ? Number(data.member_cashback_pct)
      : null;
  return {
    cashBack: formatMemberEarningsBadge(resolveMemberEarningsProfile(data.member_earnings_profile, legacy)),
    id: Number(data.id),
    name: (data.display_name as string | null)?.trim() || String(data.name),
    website: (data.website as string | null) ?? null,
    logoUrl: (data.logo_url as string | null) ?? null,
    referralUrl: String(data.referral_url),
    referralTermsUrl: (data.referral_terms_url as string | null) ?? null,
    referralSubidParam: (data.referral_subid_param as string | null) ?? null,
  };
}

export async function recordReferralClick(
  admin: SupabaseClient,
  params: { userId: string; customerUuid: string | null; provider: ReferralProvider },
): Promise<{ trackingId: string; url: string }> {
  const trackingId = newTrackingId();
  const { error } = await admin.from('member_referral_clicks').insert({
    tracking_id: trackingId,
    user_id: params.userId,
    customer_id: params.customerUuid,
    provider_id: params.provider.id,
  });
  if (error) throw new Error(error.message);
  return {
    trackingId,
    url: buildReferralUrl(params.provider.referralUrl, params.provider.referralSubidParam, trackingId),
  };
}

type ClickRow = {
  id: string;
  provider_id: number;
  clicked_at: string;
  response: ReferralResponse | null;
  responded_at: string | null;
  solution_providers: { name: string; display_name: string | null; website: string | null; logo_url: string | null } | null;
};

export type ReferralLocation = { id: string; label: string; address: string; isPrimary: boolean };

/** Account locations a confirmed referral deal can be assigned to, primary first. */
export async function listReferralLocations(
  admin: SupabaseClient,
  customerUuid: string,
): Promise<ReferralLocation[]> {
  const { data, error } = await admin
    .from('customer_locations')
    .select('external_id, label, street, city, state, zip, is_primary')
    .eq('customer_id', customerUuid)
    .order('is_primary', { ascending: false })
    .order('label', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((l) => typeof l.external_id === 'string' && l.external_id.trim())
    .map((l) => {
      const cityState = [l.city, l.state].filter(Boolean).join(', ');
      return {
        id: l.external_id as string,
        label: (l.label as string | null)?.trim() || 'Location',
        address: [l.street, [cityState, l.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        isPrimary: Boolean(l.is_primary),
      };
    });
}

/**
 * Latest unanswered click per supplier. "Not yet" answers come back 24h after the answer;
 * "Yes" / "No" close the follow-up.
 */
export async function listPendingReferralFollowUps(
  admin: SupabaseClient,
  userId: string,
  now = Date.now(),
): Promise<PendingReferralFollowUp[]> {
  const { data, error } = await admin
    .from('member_referral_clicks')
    .select('id, provider_id, clicked_at, response, responded_at, solution_providers(name, display_name, website, logo_url)')
    .eq('user_id', userId)
    .order('clicked_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  const answered = new Set<number>();
  const seen = new Set<number>();
  const out: PendingReferralFollowUp[] = [];
  for (const row of (data ?? []) as unknown as ClickRow[]) {
    if (row.response === 'signed_up' || row.response === 'no') answered.add(row.provider_id);
  }
  for (const row of (data ?? []) as unknown as ClickRow[]) {
    if (seen.has(row.provider_id) || answered.has(row.provider_id)) continue;
    seen.add(row.provider_id);
    const since = row.response === 'not_yet' && row.responded_at ? row.responded_at : row.clicked_at;
    const p = row.solution_providers;
    out.push({
      clickId: row.id,
      providerId: row.provider_id,
      supplierName: p?.display_name?.trim() || p?.name || 'Supplier',
      supplierWebsite: p?.website ?? undefined,
      supplierLogoUrl: p?.logo_url ?? undefined,
      clickedAt: row.clicked_at,
      due: now - new Date(since).getTime() >= REFERRAL_FOLLOW_UP_DELAY_MS,
    });
  }
  return out;
}

/** Records the member's answer. "Yes" creates a pending deal with the member as agent of record. */
export async function respondToReferral(
  admin: SupabaseClient,
  params: {
    userId: string;
    clickId: string;
    response: ReferralResponse;
    customer: {
      customerUuid: string;
      customerExternalId: string;
      contactName: string | null;
      contactEmail: string | null;
      primaryLocationId: string;
    } | null;
  },
): Promise<{ dealExternalId: string | null }> {
  const { data: click, error } = await admin
    .from('member_referral_clicks')
    .select('id, tracking_id, provider_id, deal_external_id, user_id')
    .eq('id', params.clickId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!click || click.user_id !== params.userId) throw new Error('Referral not found');

  const now = new Date().toISOString();
  let dealExternalId: string | null = (click.deal_external_id as string | null) ?? null;

  if (params.response === 'signed_up' && params.customer && !dealExternalId) {
    const { data: provider } = await admin
      .from('solution_providers')
      .select('name, display_name')
      .eq('id', click.provider_id)
      .maybeSingle();
    const vendor = (provider?.display_name as string | null)?.trim() || String(provider?.name ?? 'Supplier');
    const lookup = await lookupMemberCashbackPct(admin, vendor);
    const agentCommId = await resolveOrCreateMemberAgent(admin, {
      customerExternalId: params.customer.customerExternalId,
      contactName: params.customer.contactName,
      contactEmail: params.customer.contactEmail,
      cashbackPct: lookup.pct,
    });

    dealExternalId = `referral-${click.tracking_id}`;
    const contract: CandidContractRecord = {
      id: dealExternalId,
      customerId: params.customer.customerExternalId,
      locationId: params.customer.primaryLocationId,
      solution: vendor,
      vendor,
      monthly: 0,
      dealStatus: 'pending',
      expires: '',
      autoRenews: false,
      isCandid: true,
      agentCommId,
      agentOfRecord: params.customer.contactName ?? undefined,
      agentCommissionRate: lookup.pct ?? undefined,
      dealNote: `Member confirmed sign-up through Candid referral link (tracking id ${click.tracking_id}).`,
    };

    const { error: dealErr } = await admin.from('deals').upsert(
      {
        customer_id: params.customer.customerUuid,
        external_id: dealExternalId,
        provider: vendor,
        deal_status: 'pending',
        monthly_cost: null,
        location_external_id: params.customer.primaryLocationId || null,
        contract_data: contract,
        updated_at: now,
      },
      { onConflict: 'external_id' },
    );
    if (dealErr) throw new Error(dealErr.message);

    await admin.from('member_service_requests').insert({
      user_id: params.userId,
      category: 'referral_signup',
      subject: `Referral sign-up: ${vendor}`,
      message: `${params.customer.contactName ?? 'Member'} confirmed they signed up with ${vendor} through the Candid referral link (tracking id ${click.tracking_id}). A pending deal (${dealExternalId}) was created with the member as agent of record — match it when the commission arrives.`,
      status: 'open',
      outcome: 'escalated_ticket',
      vendor_name: vendor,
      customer_name: params.customer.contactName,
      customer_email: params.customer.contactEmail,
      created_at: now,
      updated_at: now,
    });

    await admin.from('member_cashback_ledger').insert({
      customer_external_id: params.customer.customerExternalId,
      deal_external_id: dealExternalId,
      vendor_name: vendor,
      provider_slug: lookup.slug,
      cashback_pct: lookup.pct,
      status: 'pending',
      member_agent_comm_id: agentCommId,
      source: 'referral_link',
      created_at: now,
      updated_at: now,
    });
  }

  const { error: updErr } = await admin
    .from('member_referral_clicks')
    .update({ response: params.response, responded_at: now, deal_external_id: dealExternalId })
    .eq('id', click.id);
  if (updErr) throw new Error(updErr.message);

  return { dealExternalId };
}
