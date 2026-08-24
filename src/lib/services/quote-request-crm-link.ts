import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePortalUserIdByEmail } from '@/lib/services/resolve-portal-user-id';

function normalizeCompany(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

/** Resolve customers.external_id from a company name (exact trim + case-insensitive). */
export async function resolveCrmCustomerExternalIdByCompany(
  admin: SupabaseClient,
  company: string | null | undefined,
): Promise<string | null> {
  const trimmed = company?.trim();
  if (!trimmed) return null;

  const { data, error } = await admin
    .from('customers')
    .select('external_id, company')
    .ilike('company', trimmed)
    .limit(10);
  if (error) throw new Error(error.message);

  const needle = normalizeCompany(trimmed);
  const match = (data ?? []).find((row) => normalizeCompany(row.company as string) === needle);
  return (match?.external_id as string | undefined) ?? null;
}

/** One-shot link for orphan quotes on an account (exact company name match only). */
export async function repairQuoteRequestLinksForCustomer(
  admin: SupabaseClient,
  customerExternalId: string,
): Promise<number> {
  const externalId = customerExternalId.trim();
  if (!externalId) return 0;

  const { data: customer, error: customerErr } = await admin
    .from('customers')
    .select('company')
    .eq('external_id', externalId)
    .maybeSingle();
  if (customerErr) throw new Error(customerErr.message);

  const company = customer?.company?.trim();
  if (!company) return 0;

  const now = new Date().toISOString();
  const { data: updated, error: updateErr } = await admin
    .from('quote_requests')
    .update({ crm_customer_id: externalId, updated_at: now })
    .is('crm_customer_id', null)
    .eq('company', company)
    .select('id');
  if (updateErr) throw new Error(updateErr.message);

  return updated?.length ?? 0;
}

/** Ensure a quote row is linked to CRM + portal member before publish / display. */
export async function ensureQuoteRequestAccountLinks(
  admin: SupabaseClient,
  row: {
    id: string;
    company?: string | null;
    contact_email?: string | null;
    crm_customer_id?: string | null;
    user_id?: string | null;
  },
): Promise<{ crmCustomerId: string | null; userId: string | null }> {
  let crmCustomerId = row.crm_customer_id?.trim() || null;
  if (!crmCustomerId) {
    crmCustomerId = await resolveCrmCustomerExternalIdByCompany(admin, row.company);
  }

  let userId = row.user_id?.trim() || null;
  const email = row.contact_email?.trim();
  if (email) {
    const portalUserId = await resolvePortalUserIdByEmail(email);
    if (portalUserId) userId = portalUserId;
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let changed = false;
  if (crmCustomerId && crmCustomerId !== row.crm_customer_id) {
    update.crm_customer_id = crmCustomerId;
    changed = true;
  }
  if (userId && userId !== row.user_id) {
    update.user_id = userId;
    changed = true;
  }

  if (changed) {
    await admin.from('quote_requests').update(update).eq('id', row.id);
  }

  return { crmCustomerId, userId };
}
