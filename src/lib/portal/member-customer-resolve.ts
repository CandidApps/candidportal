import { cookies } from 'next/headers';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getMyRole, isCandidAdminEmail } from '@/lib/auth/roles';
import { PORTAL_PREVIEW_CUSTOMER_COOKIE } from '@/lib/portal/preview-cookie';

export type MemberPortalCustomerContext = {
  customerExternalId: string;
  customerUuid: string;
  companyName: string;
  contactExternalId: string;
  contactName: string;
  contactEmail: string;
  isPrimaryContact: boolean;
  locationIds: string[];
};

type ContactJoinRow = {
  external_id: string;
  name: string;
  email: string;
  is_primary: boolean;
  location_ids: string[] | null;
  customer_id: string;
  customers: { external_id: string; company: string } | { external_id: string; company: string }[];
};

function contextFromContactRow(row: ContactJoinRow): MemberPortalCustomerContext | null {
  const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  if (!customer) return null;
  return {
    customerExternalId: customer.external_id,
    customerUuid: row.customer_id,
    companyName: customer.company,
    contactExternalId: row.external_id,
    contactName: row.name,
    contactEmail: row.email,
    isPrimaryContact: row.is_primary,
    locationIds: row.location_ids ?? [],
  };
}

/** Resolve CRM customer + contact for a logged-in portal member by email. */
export async function resolveMemberPortalCustomer(
  email: string,
  opts?: { requirePortalAccess?: boolean },
): Promise<MemberPortalCustomerContext | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const requirePortalAccess = opts?.requirePortalAccess !== false;
  const admin = createSupabaseAdminClient();
  let query = admin
    .from('customer_contacts')
    .select(
      'external_id, name, email, is_primary, location_ids, portal_access, customer_id, customers!inner(external_id, company)',
    )
    .ilike('email', normalized)
    .limit(5);

  if (requirePortalAccess) {
    query = query.eq('portal_access', true);
  }

  const { data: contacts, error } = await query;
  if (error || !contacts?.length) return null;

  return contextFromContactRow(contacts[0] as ContactJoinRow);
}

/** Resolve by CRM customer external_id (admin preview / explicit scope). */
export async function resolveMemberPortalCustomerByExternalId(
  customerExternalId: string,
): Promise<MemberPortalCustomerContext | null> {
  const externalId = customerExternalId.trim();
  if (!externalId) return null;

  const admin = createSupabaseAdminClient();
  const { data: customer, error } = await admin
    .from('customers')
    .select('id, external_id, company')
    .eq('external_id', externalId)
    .maybeSingle();

  if (error || !customer) return null;

  const { data: contacts } = await admin
    .from('customer_contacts')
    .select('external_id, name, email, is_primary, location_ids')
    .eq('customer_id', customer.id)
    .order('is_primary', { ascending: false })
    .limit(5);

  const contact = (contacts ?? []).find((c) => c.is_primary) ?? contacts?.[0];

  return {
    customerExternalId: customer.external_id as string,
    customerUuid: customer.id as string,
    companyName: customer.company as string,
    contactExternalId: (contact?.external_id as string) ?? `${externalId}-contact`,
    contactName: (contact?.name as string) ?? (customer.company as string),
    contactEmail: (contact?.email as string) ?? '',
    isPrimaryContact: Boolean(contact?.is_primary ?? true),
    locationIds: (contact?.location_ids as string[] | null) ?? [],
  };
}

async function previewCustomerIdFromCookie(): Promise<string | null> {
  try {
    const jar = await cookies();
    const raw = jar.get(PORTAL_PREVIEW_CUSTOMER_COOKIE)?.value;
    if (!raw) return null;
    return decodeURIComponent(raw).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Resolve portal customer for API routes.
 * Prefer explicit/admin-preview customer id, then contact email linkage.
 */
export async function resolvePortalCustomerForRequest(opts: {
  email: string | null | undefined;
  customerExternalId?: string | null;
}): Promise<MemberPortalCustomerContext | null> {
  const email = opts.email?.trim() ?? '';
  const role = await getMyRole();
  const fromBody = opts.customerExternalId?.trim() || null;
  const fromCookie = await previewCustomerIdFromCookie();
  const scopedId = fromBody || fromCookie;
  const previewActive = Boolean(fromCookie);
  const adminLike = role === 'admin' || (email ? isCandidAdminEmail(email) : false);

  // Admin preview / login-as: honor scoped account when caller is admin-like,
  // or when a preview cookie is present (set by Login as customer).
  if (scopedId && (adminLike || previewActive)) {
    const byId = await resolveMemberPortalCustomerByExternalId(scopedId);
    if (byId) return byId;
  }

  if (email) {
    const withAccess = await resolveMemberPortalCustomer(email, { requirePortalAccess: true });
    if (withAccess) return withAccess;
    const anyContact = await resolveMemberPortalCustomer(email, { requirePortalAccess: false });
    if (anyContact) return anyContact;
  }

  return null;
}
