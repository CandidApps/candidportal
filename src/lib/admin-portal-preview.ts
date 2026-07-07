import type { Contact, Customer } from '@/components/CustomersView';
import { grantFromContact, type PortalAccessGrant } from '@/lib/portal-access';

export type AdminPortalPreviewEntry = {
  customerId: string;
  company: string;
  contact: Contact;
  /** Short label for dropdown rows */
  subtitle: string;
  kind: 'portal' | 'paying';
};

export function customerHasPortalAccess(customer: Customer): boolean {
  return customer.contacts.some((c) => c.portalAccess && c.email.trim());
}

/** Active recurring accounts treated as paying clients. */
export function customerIsPaying(client: Customer): boolean {
  return client.status === 'active';
}

function previewContactForCustomer(customer: Customer): Contact | null {
  const portalContact = customer.contacts.find((c) => c.portalAccess && c.email.trim());
  if (portalContact) return portalContact;

  if (!customerIsPaying(customer)) return null;

  const withEmail = customer.contacts.filter((c) => c.email.trim());
  return withEmail.find((c) => c.isPrimary) ?? withEmail[0] ?? null;
}

/** Paying or portal-subscribed customers eligible for admin member-portal preview. */
export function listAdminPortalPreviewEntries(customers: Customer[]): AdminPortalPreviewEntry[] {
  const entries: AdminPortalPreviewEntry[] = [];

  for (const customer of customers) {
    const hasPortal = customerHasPortalAccess(customer);
    const paying = customerIsPaying(customer);
    if (!hasPortal && !paying) continue;

    const contact = previewContactForCustomer(customer);
    if (!contact?.email.trim()) continue;

    const kind: AdminPortalPreviewEntry['kind'] = hasPortal ? 'portal' : 'paying';
    const tier =
      contact.portalAccess && contact.portalAccessTier === 'full'
        ? 'Full portal'
        : contact.portalAccess
          ? 'Trial portal'
          : 'Active account';

    entries.push({
      customerId: customer.id,
      company: customer.company,
      contact,
      subtitle: `${contact.name} · ${tier}`,
      kind,
    });
  }

  return entries.sort((a, b) => a.company.localeCompare(b.company, undefined, { sensitivity: 'base' }));
}

export function filterPortalPreviewEntries(
  entries: AdminPortalPreviewEntry[],
  query: string,
): AdminPortalPreviewEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    (e) =>
      e.company.toLowerCase().includes(q) ||
      e.contact.name.toLowerCase().includes(q) ||
      e.contact.email.toLowerCase().includes(q),
  );
}

/** Build a preview grant for portal contacts or paying active accounts (admin override). */
export function adminPreviewGrant(contact: Contact, customer: Customer): PortalAccessGrant | null {
  const fromPortal = grantFromContact(contact, customer);
  if (fromPortal) return fromPortal;

  if (!customerIsPaying(customer) || !contact.email.trim()) return null;

  return {
    email: contact.email.trim(),
    contactId: contact.id,
    contactName: contact.name,
    customerId: customer.id,
    companyName: customer.company,
    tier: 'full',
    locationIds: contact.locationIds ?? [],
    invitedAt: contact.portalInviteSentAt ?? new Date().toISOString(),
  };
}
