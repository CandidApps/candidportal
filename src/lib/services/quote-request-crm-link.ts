import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePortalUserIdByEmail } from '@/lib/services/resolve-portal-user-id';

function normalizeCompany(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function normalizeEmail(value: string | null | undefined): string {
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

/** Resolve customers.external_id from a CRM contact email. */
export async function resolveCrmCustomerExternalIdByContactEmail(
  admin: SupabaseClient,
  email: string | null | undefined,
): Promise<string | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const { data, error } = await admin
    .from('customer_contacts')
    .select('customers!inner(external_id)')
    .ilike('email', normalized)
    .limit(5);
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
    const externalId = (customer as { external_id?: string } | undefined)?.external_id;
    if (externalId) return externalId;
  }
  return null;
}

/** All contact emails on a CRM account (portal + non-portal). */
export async function resolveContactEmailsForCustomer(
  admin: SupabaseClient,
  customerExternalId: string,
): Promise<string[]> {
  const externalId = customerExternalId.trim();
  if (!externalId) return [];

  const { data: customer, error: customerErr } = await admin
    .from('customers')
    .select('id')
    .eq('external_id', externalId)
    .maybeSingle();
  if (customerErr) throw new Error(customerErr.message);
  if (!customer?.id) return [];

  const { data: contacts, error } = await admin
    .from('customer_contacts')
    .select('email')
    .eq('customer_id', customer.id);
  if (error) throw new Error(error.message);

  return [
    ...new Set(
      (contacts ?? [])
        .map((c) => normalizeEmail(c.email as string))
        .filter(Boolean),
    ),
  ];
}

/** Portal auth user ids for contacts on a CRM account who have signed up. */
export async function resolvePortalUserIdsForCustomer(
  admin: SupabaseClient,
  customerExternalId: string,
): Promise<string[]> {
  const emails = await resolveContactEmailsForCustomer(admin, customerExternalId);
  const userIds: string[] = [];
  for (const email of emails) {
    const uid = await resolvePortalUserIdByEmail(email);
    if (uid) userIds.push(uid);
  }
  return [...new Set(userIds)];
}

async function profileIsAdmin(admin: SupabaseClient, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { data } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle();
  return data?.role === 'admin';
}

/** Best portal owner for a quote: contact email first, then any user on the CRM account. */
async function resolveBestPortalUserIdForQuote(
  admin: SupabaseClient,
  opts: {
    contactEmail?: string | null;
    crmCustomerId?: string | null;
    currentUserId?: string | null;
  },
): Promise<string | null> {
  const fromContact = await resolvePortalUserIdByEmail(opts.contactEmail);
  if (fromContact) return fromContact;

  const crmId = opts.crmCustomerId?.trim();
  if (crmId) {
    const accountUsers = await resolvePortalUserIdsForCustomer(admin, crmId);
    if (accountUsers.length) return accountUsers[0] ?? null;
  }

  const current = opts.currentUserId?.trim();
  if (current && !(await profileIsAdmin(admin, current))) return current;

  return null;
}

/** One-shot link for orphan quotes on an account (company + contact email match). */
export async function repairQuoteRequestLinksForCustomer(
  admin: SupabaseClient,
  customerExternalId: string,
): Promise<{ crmLinked: number; userRelinked: number }> {
  const externalId = customerExternalId.trim();
  if (!externalId) return { crmLinked: 0, userRelinked: 0 };

  const { data: customer, error: customerErr } = await admin
    .from('customers')
    .select('company')
    .eq('external_id', externalId)
    .maybeSingle();
  if (customerErr) throw new Error(customerErr.message);

  const company = customer?.company?.trim() ?? '';
  const accountEmails = new Set(await resolveContactEmailsForCustomer(admin, externalId));

  const { data: orphans, error: orphanErr } = await admin
    .from('quote_requests')
    .select('id, company, contact_email, crm_customer_id, user_id')
    .is('crm_customer_id', null)
    .order('created_at', { ascending: false })
    .limit(500);
  if (orphanErr) throw new Error(orphanErr.message);

  const matchingOrphans = (orphans ?? []).filter((row) => {
    if (company && normalizeCompany(row.company as string) === normalizeCompany(company)) {
      return true;
    }
    const email = normalizeEmail(row.contact_email as string | null | undefined);
    return Boolean(email && accountEmails.has(email));
  });

  let crmLinked = 0;
  let userRelinked = 0;

  for (const row of matchingOrphans) {
    const before = {
      crm: (row.crm_customer_id as string | null)?.trim() || null,
      user: (row.user_id as string | null)?.trim() || null,
    };
    const after = await ensureQuoteRequestAccountLinks(
      admin,
      {
        id: row.id as string,
        company: row.company as string | null,
        contact_email: row.contact_email as string | null,
        crm_customer_id: row.crm_customer_id as string | null,
        user_id: row.user_id as string | null,
      },
      { customerExternalId: externalId },
    );
    if (after.crmCustomerId && !before.crm) crmLinked += 1;
    if (after.userId && after.userId !== before.user) userRelinked += 1;
  }

  // Re-link user_id on quotes already tied to this account (e.g. still owned by admin).
  const { data: linked, error: linkedErr } = await admin
    .from('quote_requests')
    .select('id, company, contact_email, crm_customer_id, user_id')
    .eq('crm_customer_id', externalId)
    .limit(500);
  if (linkedErr) throw new Error(linkedErr.message);

  for (const row of linked ?? []) {
    const beforeUser = (row.user_id as string | null)?.trim() || null;
    const after = await ensureQuoteRequestAccountLinks(
      admin,
      {
        id: row.id as string,
        company: row.company as string | null,
        contact_email: row.contact_email as string | null,
        crm_customer_id: row.crm_customer_id as string | null,
        user_id: row.user_id as string | null,
      },
      { customerExternalId: externalId },
    );
    if (after.userId && after.userId !== beforeUser) userRelinked += 1;
  }

  const ownerRepair = await repairMisassignedQuoteRequestOwners(admin, {
    customerExternalId: externalId,
  });
  userRelinked += ownerRepair.userRelinked;

  return { crmLinked, userRelinked };
}

/** Repair every quote missing crm_customer_id (email + company lookup). */
export async function repairAllOrphanQuoteRequestLinks(
  admin: SupabaseClient,
  opts?: { limit?: number },
): Promise<{ scanned: number; crmLinked: number; userRelinked: number }> {
  const limit = opts?.limit ?? 1000;
  const { data: orphans, error } = await admin
    .from('quote_requests')
    .select('id, company, contact_email, crm_customer_id, user_id')
    .is('crm_customer_id', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  let crmLinked = 0;
  let userRelinked = 0;

  for (const row of orphans ?? []) {
    const before = {
      crm: (row.crm_customer_id as string | null)?.trim() || null,
      user: (row.user_id as string | null)?.trim() || null,
    };
    const after = await ensureQuoteRequestAccountLinks(admin, {
      id: row.id as string,
      company: row.company as string | null,
      contact_email: row.contact_email as string | null,
      crm_customer_id: row.crm_customer_id as string | null,
      user_id: row.user_id as string | null,
    });
    if (after.crmCustomerId && !before.crm) crmLinked += 1;
    if (after.userId && after.userId !== before.user) userRelinked += 1;
  }

  return { scanned: orphans?.length ?? 0, crmLinked, userRelinked };
}

/** Reassign quotes still owned by an admin user_id but linked to a CRM account. */
export async function repairMisassignedQuoteRequestOwners(
  admin: SupabaseClient,
  opts?: { customerExternalId?: string | null; limit?: number },
): Promise<{ scanned: number; userRelinked: number }> {
  const limit = opts?.limit ?? 500;
  let query = admin
    .from('quote_requests')
    .select('id, company, contact_email, crm_customer_id, user_id')
    .not('crm_customer_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(limit);

  const externalId = opts?.customerExternalId?.trim();
  if (externalId) query = query.eq('crm_customer_id', externalId);

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);

  let userRelinked = 0;
  for (const row of rows ?? []) {
    const currentUser = (row.user_id as string | null)?.trim() || null;
    if (!currentUser || !(await profileIsAdmin(admin, currentUser))) continue;

    const after = await ensureQuoteRequestAccountLinks(
      admin,
      {
        id: row.id as string,
        company: row.company as string | null,
        contact_email: row.contact_email as string | null,
        crm_customer_id: row.crm_customer_id as string | null,
        user_id: row.user_id as string | null,
      },
      { customerExternalId: row.crm_customer_id as string },
    );
    if (after.userId && after.userId !== currentUser) userRelinked += 1;
  }

  return { scanned: rows?.length ?? 0, userRelinked };
}

/** Backfill contract_submit_actions.crm_customer_external_id from linked quotes. */
export async function repairContractSubmitActionLinksForCustomer(
  admin: SupabaseClient,
  customerExternalId: string,
): Promise<number> {
  const externalId = customerExternalId.trim();
  if (!externalId) return 0;

  const { data: quotes, error: quoteErr } = await admin
    .from('quote_requests')
    .select('id')
    .eq('crm_customer_id', externalId);
  if (quoteErr) throw new Error(quoteErr.message);

  const quoteIds = (quotes ?? []).map((row) => String(row.id)).filter(Boolean);
  if (!quoteIds.length) return 0;

  const now = new Date().toISOString();
  const { data: updated, error: updateErr } = await admin
    .from('contract_submit_actions')
    .update({ crm_customer_external_id: externalId, updated_at: now })
    .is('crm_customer_external_id', null)
    .in('quote_request_id', quoteIds)
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
  opts?: { customerExternalId?: string | null },
): Promise<{ crmCustomerId: string | null; userId: string | null }> {
  let crmCustomerId =
    row.crm_customer_id?.trim() || opts?.customerExternalId?.trim() || null;
  const email = row.contact_email?.trim();

  if (!crmCustomerId && email) {
    crmCustomerId = await resolveCrmCustomerExternalIdByContactEmail(admin, email);
  }
  if (!crmCustomerId) {
    crmCustomerId = await resolveCrmCustomerExternalIdByCompany(admin, row.company);
  }

  let userId = row.user_id?.trim() || null;
  const bestUserId = await resolveBestPortalUserIdForQuote(admin, {
    contactEmail: email,
    crmCustomerId,
    currentUserId: userId,
  });
  if (bestUserId) {
    userId = bestUserId;
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

/** Quote requests visible to any portal user on a CRM account. */
export async function fetchQuoteRequestsForPortalCustomer(
  admin: SupabaseClient,
  customerExternalId: string,
  opts?: { scope?: 'all' | 'published' },
): Promise<Record<string, unknown>[]> {
  const externalId = customerExternalId.trim();
  const accountEmails = new Set(await resolveContactEmailsForCustomer(admin, externalId));

  const scopePublished = opts?.scope !== 'all';

  const { data: byCrm, error: crmErr } = scopePublished
    ? await admin
        .from('quote_requests')
        .select('*')
        .eq('crm_customer_id', externalId)
        .not('published_quote_snapshot', 'is', null)
        .order('published_at', { ascending: false })
    : await admin
        .from('quote_requests')
        .select('*')
        .eq('crm_customer_id', externalId)
        .order('created_at', { ascending: false })
        .limit(100);

  if (crmErr && !crmErr.message.includes('published_quote_snapshot')) {
    throw new Error(crmErr.message);
  }

  let orphanRows: Record<string, unknown>[] = [];
  if (accountEmails.size > 0) {
    const { data, error: orphanErr } = scopePublished
      ? await admin
          .from('quote_requests')
          .select('*')
          .is('crm_customer_id', null)
          .not('published_quote_snapshot', 'is', null)
          .order('published_at', { ascending: false })
          .limit(100)
      : await admin
          .from('quote_requests')
          .select('*')
          .is('crm_customer_id', null)
          .order('created_at', { ascending: false })
          .limit(100);

    if (orphanErr && !orphanErr.message.includes('published_quote_snapshot')) {
      throw new Error(orphanErr.message);
    }
    orphanRows = ((data ?? []) as Record<string, unknown>[]).filter((row) => {
      const email = normalizeEmail(row.contact_email as string | null | undefined);
      return Boolean(email && accountEmails.has(email));
    });

    // Persist CRM links for orphans we surfaced so the next fetch is clean.
    for (const row of orphanRows) {
      await ensureQuoteRequestAccountLinks(
        admin,
        {
          id: String(row.id ?? ''),
          company: row.company as string | null,
          contact_email: row.contact_email as string | null,
          crm_customer_id: row.crm_customer_id as string | null,
          user_id: row.user_id as string | null,
        },
        { customerExternalId: externalId },
      ).catch(() => undefined);
    }
  }

  const merged = new Map<string, Record<string, unknown>>();
  for (const row of [...(byCrm ?? []), ...orphanRows] as Record<string, unknown>[]) {
    const id = String(row.id ?? '');
    if (!id) continue;
    merged.set(id, row);
  }

  return [...merged.values()].sort((a, b) => {
    const aTs = String(a.published_at ?? a.created_at ?? '');
    const bTs = String(b.published_at ?? b.created_at ?? '');
    return bTs.localeCompare(aTs);
  });
}
