import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMyRole, isCandidAdminEmail } from '@/lib/auth/roles';
import { resolvePortalCustomerForRequest } from '@/lib/portal/member-customer-resolve';
import { buildReferralUrl, loadReferralProvider, recordReferralClick } from '@/lib/services/member-referrals';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ReferralRedirect } from './ReferralRedirect';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Heading to supplier — Candid IQ', robots: { index: false } };

export default async function ReferralGoPage({ params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const admin = createSupabaseAdminClient();
  const id = Number(providerId);
  const provider = Number.isInteger(id) && id > 0 ? await loadReferralProvider(admin, id) : null;

  if (!provider) {
    return (
      <main className="referral-go">
        <div className="referral-go-card">
          <h1 className="referral-go-title">This offer is no longer available</h1>
          <Link className="referral-go-link" href="/app">
            Back to Find Solutions
          </Link>
        </div>
      </main>
    );
  }

  const role = await getMyRole();
  const isStaff = role === 'admin' || role === 'agent' || isCandidAdminEmail(user.email ?? '');
  let destination = provider.referralUrl;
  if (!isStaff) {
    const customer = await resolvePortalCustomerForRequest({ email: user.email });
    const click = await recordReferralClick(admin, {
      userId: user.id,
      customerUuid: customer?.customerUuid ?? null,
      provider,
    });
    destination = click.url;
  } else {
    destination = buildReferralUrl(provider.referralUrl, provider.referralSubidParam, 'staff-preview');
  }

  return (
    <ReferralRedirect
      destination={destination}
      supplierName={provider.name}
      supplierWebsite={provider.website ?? undefined}
      supplierLogoUrl={provider.logoUrl ?? undefined}
      cashBack={provider.cashBack}
      termsUrl={provider.referralTermsUrl ?? undefined}
      staffPreview={isStaff}
    />
  );
}
