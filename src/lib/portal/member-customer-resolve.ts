import { createSupabaseAdminClient } from '@/lib/supabase/admin';

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

/** Resolve CRM customer + contact for a logged-in portal member by email. */
export async function resolveMemberPortalCustomer(
  email: string,
): Promise<MemberPortalCustomerContext | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const admin = createSupabaseAdminClient();
  const { data: contacts, error } = await admin
    .from('customer_contacts')
    .select(
      'external_id, name, email, is_primary, location_ids, portal_access, customer_id, customers!inner(external_id, company)',
    )
    .ilike('email', normalized)
    .eq('portal_access', true)
    .limit(5);

  if (error || !contacts?.length) return null;

  const row = contacts[0] as {
    external_id: string;
    name: string;
    email: string;
    is_primary: boolean;
    location_ids: string[] | null;
    customer_id: string;
    customers: { external_id: string; company: string } | { external_id: string; company: string }[];
  };

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
