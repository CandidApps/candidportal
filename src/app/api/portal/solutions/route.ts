import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  derivedMemberCashbackPct,
  formatMemberEarningsSentence,
  isMemberEarningsNone,
  resolveMemberEarningsProfile,
} from '@/lib/member-earnings-profile';
import {
  campaignToMemberPromo,
  isCampaignLive,
  mapDbCampaign,
  type DbIncentiveCampaign,
  type MemberTier,
} from '@/lib/incentive-campaigns';
import {
  fetchCustomerMemberTier,
  resolvePortalCustomerForRequest,
} from '@/lib/portal/member-customer-resolve';
import type { MemberPromo, MemberPromoSlide } from '@/lib/member-promos';
import { providerCategoryToSolution, type CatalogSupplier } from '@/lib/solutions/catalog';
import { normalizeTagList } from '@/lib/solutions/find-solutions-tags';
import type {
  DbSolutionProvider,
  DbSolutionProviderSolution,
} from '@/lib/solution-providers-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Members only need to be authenticated; we expose a safe subset of supplier data.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ suppliers: [] });

  try {
    const memberTier = await resolveViewerMemberTier(user.email);
    const admin = createSupabaseAdminClient();
    const [providersRes, solutionsRes, campaignsRes] = await Promise.all([
      // '*' so the page still loads on databases that don't have the referral columns yet.
      admin.from('solution_providers').select('*').order('name'),
      admin.from('solution_provider_solutions').select('id, provider_id, name, description'),
      admin
        .from('incentive_campaigns')
        .select('*')
        .eq('customer_facing', 'yes')
        .is('ended_early_at', null)
        .order('slide_order', { ascending: true }),
    ]);

    if (providersRes.error) throw new Error(providersRes.error.message);

    const providers = (providersRes.data ?? []) as Array<
      Pick<
        DbSolutionProvider,
        | 'id'
        | 'name'
        | 'display_name'
        | 'website'
        | 'provider_category'
        | 'description'
        | 'candid_recommended'
        | 'member_cashback_pct'
        | 'member_earnings_profile'
        | 'find_capabilities'
        | 'find_services'
        | 'logo_url'
        | 'member_buy_mode'
        | 'referral_url'
        | 'referral_terms_url'
      >
    >;
    const solutions = (solutionsRes.data ?? []) as Pick<
      DbSolutionProviderSolution,
      'id' | 'provider_id' | 'name' | 'description'
    >[];

    const solByProvider = new Map<number, DbSolutionProviderSolution[]>();
    for (const s of solutions) {
      const list = solByProvider.get(s.provider_id) ?? [];
      list.push(s as DbSolutionProviderSolution);
      solByProvider.set(s.provider_id, list);
    }

    const providerById = new Map(providers.map((p) => [p.id, p]));
    const promosByProvider = new Map<number, MemberPromo[]>();
    const slides: MemberPromoSlide[] = [];
    for (const row of (campaignsRes.data ?? []) as DbIncentiveCampaign[]) {
      const campaign = mapDbCampaign(row);
      if (!isCampaignLive(campaign)) continue;
      const promo = campaignToMemberPromo(campaign, memberTier);
      const list = promosByProvider.get(campaign.providerDbId) ?? [];
      list.push(promo);
      promosByProvider.set(campaign.providerDbId, list);

      const provider = providerById.get(campaign.providerDbId);
      if (!campaign.showInSlider || !provider) continue;
      slides.push({
        id: campaign.id,
        supplierName: provider.display_name?.trim() || provider.name,
        supplierWebsite: provider.website ?? undefined,
        supplierLogoUrl: provider.logo_url ?? undefined,
        title: promo.title,
        details: promo.details,
        endsOn: promo.expiresOn,
        ctaLabel: campaign.ctaLabel,
        bannerImageUrl: campaign.bannerImageUrl,
      });
    }

    const suppliers: CatalogSupplier[] = providers.map((p) => {
      const sols = solByProvider.get(p.id) ?? [];
      const adminCapabilities = normalizeTagList(p.find_capabilities);
      const adminServices = normalizeTagList(p.find_services);
      const solutionFeatures = sols
        .map((s) => s.name?.trim())
        .filter((n): n is string => Boolean(n))
        .slice(0, 6);
      const features =
        adminCapabilities.length > 0
          ? adminCapabilities
          : solutionFeatures.length
            ? solutionFeatures
            : ['In Candid’s active supplier network'];
      const legacyPct =
        p.member_cashback_pct != null && Number.isFinite(Number(p.member_cashback_pct))
          ? Number(p.member_cashback_pct)
          : null;
      const earningsProfile = resolveMemberEarningsProfile(p.member_earnings_profile, legacyPct);
      const hasEarnings = !isMemberEarningsNone(earningsProfile);
      return {
        name: p.display_name?.trim() || p.name,
        website: p.website ?? undefined,
        categories: [providerCategoryToSolution(p.provider_category)],
        features,
        capabilities: adminCapabilities,
        services: adminServices,
        description: p.description?.trim() || undefined,
        candidRecommended: Boolean(p.candid_recommended),
        earningsProfile: hasEarnings ? earningsProfile : null,
        earningsCopy: formatMemberEarningsSentence(earningsProfile),
        cashbackPct: derivedMemberCashbackPct(earningsProfile),
        promos: promosByProvider.get(p.id) ?? [],
        logoUrl: p.logo_url ?? undefined,
        providerId: p.id,
        buyMode: p.member_buy_mode === 'referral' && p.referral_url ? 'referral' : 'quote',
        referralTermsUrl: p.referral_terms_url ?? undefined,
        source: 'candid',
      };
    });

    return NextResponse.json({ suppliers, slides, memberTier });
  } catch {
    return NextResponse.json({ suppliers: [], slides: [] });
  }
}

/**
 * Tier of the member (or admin-previewed member) viewing the catalog. Admins browsing without a
 * member in scope see the Paid share so promos show the most a member can earn.
 */
async function resolveViewerMemberTier(email: string | undefined): Promise<MemberTier> {
  const ctx = await resolvePortalCustomerForRequest({ email }).catch(() => null);
  if (ctx) return fetchCustomerMemberTier(ctx.customerUuid);
  return 'basic';
}
