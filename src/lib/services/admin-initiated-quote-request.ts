import type { Customer } from '@/components/CustomersView';
import type { Lead } from '@/components/LeadsView';
import { loadCrmCustomerSlice } from '@/lib/crm/load-from-db';
import { createPortalLeadForQuoteRequest } from '@/lib/services/portal-leads';
import { resolvePortalUserIdByEmail } from '@/lib/services/resolve-portal-user-id';
import {
  buildQuoteRequestSubject,
  insertQuoteRequest,
  type QuoteRequestLocation,
} from '@/lib/services/quote-requests';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export type AdminInitiatedQuoteSource = 'account' | 'lead';

export type AdminInitiatedQuoteInput = {
  source: AdminInitiatedQuoteSource;
  customerExternalId?: string;
  portalLeadRowId?: string;
  leadId?: string;
  mode?: 'request' | 'add-services';
  /** Fallback when CRM row is not in DB (e.g. demo seed). */
  customerSnapshot?: Customer;
  leadSnapshot?: Lead;
  initiatedByUserId: string;
};

function primaryContactFromCustomer(customer: Customer) {
  return (
    customer.contacts.find((c) => c.isPrimary) ??
    customer.contacts.find((c) => c.email?.trim()) ??
    customer.contacts[0] ??
    null
  );
}

function primaryLocationFromCustomer(customer: Customer): QuoteRequestLocation | null {
  const loc =
    customer.locations.find((l) => l.isPrimary) ??
    customer.locations[0] ??
    null;
  if (!loc) return null;
  return {
    id: loc.id,
    label: loc.label,
    street: loc.street,
    city: loc.city,
    state: loc.state,
    zip: loc.zip,
  };
}

function primaryContactFromLead(lead: Lead) {
  return (
    lead.contacts.find((c) => c.isPrimary) ??
    lead.contacts.find((c) => c.email?.trim()) ??
    lead.contacts[0] ??
    null
  );
}

function primaryLocationFromLead(lead: Lead): QuoteRequestLocation | null {
  const loc =
    lead.locations.find((l) => l.isPrimary) ??
    lead.locations[0] ??
    null;
  if (!loc) return null;
  return {
    id: loc.id,
    label: loc.label,
    street: loc.street,
    city: loc.city,
    state: loc.state,
    zip: loc.zip,
  };
}

async function loadLeadFromPortal(
  portalLeadRowId?: string,
  leadId?: string,
): Promise<{ lead: Lead; portalLeadRowId: string | null; userId: string | null } | null> {
  const admin = createSupabaseAdminClient();
  type PortalLeadRow = {
    id: string;
    user_id: string | null;
    lead_data: Lead;
  };
  let row: PortalLeadRow | null = null;

  if (portalLeadRowId) {
    const { data } = await admin
      .from('portal_leads')
      .select('id, user_id, lead_data')
      .eq('id', portalLeadRowId)
      .maybeSingle();
    row = (data as PortalLeadRow | null) ?? null;
  } else if (leadId) {
    const { data: rows } = await admin.from('portal_leads').select('id, user_id, lead_data').limit(200);
    const match = (rows ?? []).find((r) => {
      const ld = r.lead_data as Lead;
      return ld?.id === leadId;
    });
    row = (match as PortalLeadRow | undefined) ?? null;
  }

  if (!row?.lead_data) return null;
  return {
    lead: row.lead_data as Lead,
    portalLeadRowId: row.id,
    userId: row.user_id,
  };
}

export async function createAdminInitiatedQuoteRequest(
  input: AdminInitiatedQuoteInput,
): Promise<{ quoteRequestId: string; lead: Lead | null }> {
  const admin = createSupabaseAdminClient();
  let company: string | null = null;
  let contactName: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;
  let location: QuoteRequestLocation | null = null;
  let portalUserId: string | null = null;
  let adminNoteSuffix = '';

  if (input.source === 'account') {
    const externalId = input.customerExternalId?.trim();
    if (!externalId) throw new Error('customerExternalId is required for account quotes');

    const slice = await loadCrmCustomerSlice(externalId);
    const customer = slice?.customers[0] ?? input.customerSnapshot;
    if (!customer) throw new Error('Account not found');

    const pc = primaryContactFromCustomer(customer);
    company = customer.company?.trim() || null;
    contactName = pc?.name?.trim() || null;
    email = pc?.email?.trim() || null;
    phone = pc?.phone?.trim() || null;
    location = primaryLocationFromCustomer(customer);
    portalUserId = await resolvePortalUserIdByEmail(email);
    adminNoteSuffix = `account ${externalId}`;
  } else {
    const loaded =
      (await loadLeadFromPortal(input.portalLeadRowId, input.leadId)) ??
      (input.leadSnapshot
        ? { lead: input.leadSnapshot, portalLeadRowId: input.leadSnapshot.portalLeadRowId ?? null, userId: null }
        : null);
    if (!loaded) throw new Error('Lead not found');

    const { lead } = loaded;
    const pc = primaryContactFromLead(lead);
    company = lead.companyFriendly?.trim() || null;
    contactName = pc?.name?.trim() || null;
    email = pc?.email?.trim() || null;
    phone = pc?.phone?.trim() || null;
    location = primaryLocationFromLead(lead);
    portalUserId = loaded.userId ?? (await resolvePortalUserIdByEmail(email));
    adminNoteSuffix = `lead ${lead.id}`;
  }

  const ownerUserId = portalUserId ?? input.initiatedByUserId;

  const { id: quoteRequestId, error: insertErr } = await insertQuoteRequest(admin, {
    userId: ownerUserId,
    mode: input.mode ?? 'request',
    name: contactName,
    company,
    email,
    phone,
    services: [],
    note: null,
    location,
  });

  if (insertErr || !quoteRequestId) {
    throw new Error(insertErr ?? 'Could not create quote request');
  }

  await admin
    .from('quote_requests')
    .update({
      admin_notes: `Admin-initiated from ${adminNoteSuffix}`,
    })
    .eq('id', quoteRequestId);

  const subject = buildQuoteRequestSubject({
    mode: input.mode ?? 'request',
    company,
    serviceTypeId: null,
    services: [],
  });

  const lead = await createPortalLeadForQuoteRequest({
    quoteRequestId,
    userId: ownerUserId,
    mode: input.mode ?? 'request',
    company,
    contactName,
    email,
    phone,
    location,
    subject,
  });

  return { quoteRequestId, lead };
}
