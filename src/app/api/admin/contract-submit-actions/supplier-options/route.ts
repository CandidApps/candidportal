import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { PAY_SOURCE_OPTIONS } from '@/lib/customer-records';
import type {
  ContractSupplierContactOption,
  PaysourceOption,
} from '@/lib/quotes/contract-supplier-options';
import { parseQuoteCustomerAcceptance } from '@/lib/quotes/quote-acceptance';
import {
  resolveQuotePackage,
  snapshotFromPublished,
} from '@/lib/quotes/quote-package-summary';
import type { PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';

export const dynamic = 'force-dynamic';

export type { ContractSupplierContactOption, PaysourceOption };

/**
 * GET ?vendor=Vonage&actionId=...
 * Returns solution_provider contacts matching the vendor + paysource partner emails.
 * When actionId is set, also returns publishedSnapshot + quotePackage for email/UI.
 */
export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const vendor = (searchParams.get('vendor') ?? '').trim();
  const actionId = (searchParams.get('actionId') ?? '').trim();

  const admin = createSupabaseAdminClient();

  let publishedSnapshot: PublishedAnalysisSnapshot | null = null;
  let quotePackage = null as ReturnType<typeof resolveQuotePackage>;

  if (actionId) {
    const { data: action } = await admin
      .from('contract_submit_actions')
      .select(
        'acceptance, vendor_name, service_label, analysis_review_id, quote_request_id',
      )
      .eq('id', actionId)
      .maybeSingle();

    if (action?.analysis_review_id) {
      const { data: review } = await admin
        .from('bill_analysis_reviews')
        .select('published_snapshot, customer_acceptance')
        .eq('id', action.analysis_review_id)
        .maybeSingle();
      publishedSnapshot = snapshotFromPublished(review?.published_snapshot);
      const acceptance =
        parseQuoteCustomerAcceptance(action.acceptance) ??
        parseQuoteCustomerAcceptance(review?.customer_acceptance);
      quotePackage = resolveQuotePackage({
        acceptance,
        snapshot: publishedSnapshot,
        vendorName: (action.vendor_name as string | null) ?? null,
        serviceLabel: (action.service_label as string | null) ?? null,
      });
    } else if (action?.quote_request_id) {
      const { data: quote } = await admin
        .from('quote_requests')
        .select('published_quote_snapshot, customer_acceptance')
        .eq('id', action.quote_request_id)
        .maybeSingle();
      publishedSnapshot = snapshotFromPublished(quote?.published_quote_snapshot);
      const acceptance =
        parseQuoteCustomerAcceptance(action.acceptance) ??
        parseQuoteCustomerAcceptance(quote?.customer_acceptance);
      quotePackage = resolveQuotePackage({
        acceptance,
        snapshot: publishedSnapshot,
        vendorName: (action.vendor_name as string | null) ?? null,
        serviceLabel: (action.service_label as string | null) ?? null,
      });
    } else if (action) {
      quotePackage = resolveQuotePackage({
        acceptance: parseQuoteCustomerAcceptance(action.acceptance),
        vendorName: (action.vendor_name as string | null) ?? null,
        serviceLabel: (action.service_label as string | null) ?? null,
      });
    }
  }

  let providersQuery = admin
    .from('solution_providers')
    .select('id, name, slug')
    .order('name');

  if (vendor) {
    providersQuery = providersQuery.or(
      `name.ilike.%${vendor}%,slug.ilike.%${vendor.replace(/\s+/g, '-')}%`,
    );
  }

  const { data: providers, error: provErr } = await providersQuery.limit(vendor ? 20 : 50);
  if (provErr) {
    return NextResponse.json({ error: provErr.message }, { status: 500 });
  }

  const providerIds = (providers ?? []).map((p) => String(p.id));
  let contacts: ContractSupplierContactOption[] = [];

  if (providerIds.length) {
    const { data: contactRows, error: contactErr } = await admin
      .from('solution_provider_contacts')
      .select('id, provider_id, name, email, role, is_primary')
      .in('provider_id', providerIds);

    if (contactErr) {
      return NextResponse.json({ error: contactErr.message }, { status: 500 });
    }

    const providerNameById = new Map(
      (providers ?? []).map((p) => [String(p.id), String(p.name)]),
    );

    contacts = (contactRows ?? [])
      .filter((c) => c.email)
      .map((c) => ({
        providerId: String(c.provider_id),
        providerName: providerNameById.get(String(c.provider_id)) ?? 'Supplier',
        contactId: String(c.id),
        contactName: String(c.name ?? 'Contact'),
        contactEmail: String(c.email),
        role: (c.role as string | null) ?? null,
        isPrimary: Boolean(c.is_primary),
      }))
      .sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return a.contactName.localeCompare(b.contactName);
      });
  }

  const { data: partners } = await admin
    .from('partner_suppliers')
    .select('id, name, contact_email, contact_name');

  const partnerByName = new Map(
    (partners ?? []).map((p) => [String(p.name).toLowerCase(), p]),
  );

  const paysources: PaysourceOption[] = PAY_SOURCE_OPTIONS.map((name) => {
    const partner = partnerByName.get(name.toLowerCase());
    return {
      name,
      partnerId: partner?.id != null ? String(partner.id) : null,
      contactEmail: (partner?.contact_email as string | null) ?? null,
      contactName: (partner?.contact_name as string | null) ?? null,
    };
  });

  return NextResponse.json({
    vendor: vendor || null,
    providers: (providers ?? []).map((p) => ({
      id: String(p.id),
      name: String(p.name),
      slug: p.slug ? String(p.slug) : null,
    })),
    contacts,
    paysources,
    publishedSnapshot,
    quotePackage,
  });
}
