import type { Contact, Customer } from '@/components/CustomersView';
import { grantFromContact, type PortalAccessGrant } from '@/lib/portal-access';

export type AdminPortalPreviewEntry = {
  customerId: string;
  company: string;
  contact: Contact;
  /** Short label for dropdown rows */
  subtitle: string;
  kind: 'portal' | 'paying' | 'account';
};

export function customerHasPortalAccess(customer: Customer): boolean {
  return customer.contacts.some((c) => c.portalAccess && c.email.trim());
}

/** Active recurring accounts treated as paying clients. */
export function customerIsPaying(client: Customer): boolean {
  return client.status === 'active';
}

/**
 * Best contact for admin "view as customer".
 * Prefers portal-enabled contacts, then primary/email contacts, then any contact.
 */
export function previewContactForCustomer(customer: Customer): Contact | null {
  if (!customer.contacts.length) return null;

  const portalContact = customer.contacts.find((c) => c.portalAccess && c.email.trim());
  if (portalContact) return portalContact;

  const withEmail = customer.contacts.filter((c) => c.email.trim());
  if (withEmail.length) {
    return withEmail.find((c) => c.isPrimary) ?? withEmail[0]!;
  }

  return customer.contacts.find((c) => c.isPrimary) ?? customer.contacts[0] ?? null;
}

function previewEmailForContact(contact: Contact, customer: Customer): string {
  const email = contact.email.trim();
  if (email) return email;
  // Admin-only synthetic address so preview works without portal invite setup.
  return `preview+${customer.id}.${contact.id}@candid.preview`;
}

/** All accounts with at least one contact — admins can preview any of them. */
export function listAdminPortalPreviewEntries(customers: Customer[]): AdminPortalPreviewEntry[] {
  const entries: AdminPortalPreviewEntry[] = [];

  for (const customer of customers) {
    const contact = previewContactForCustomer(customer);
    if (!contact) continue;

    const hasPortal = customerHasPortalAccess(customer);
    const paying = customerIsPaying(customer);
    const kind: AdminPortalPreviewEntry['kind'] = hasPortal
      ? 'portal'
      : paying
        ? 'paying'
        : 'account';

    const tier =
      contact.portalAccess && contact.portalAccessTier === 'full'
        ? 'Full portal'
        : contact.portalAccess
          ? 'Trial portal'
          : paying
            ? 'Active account'
            : 'Admin preview';

    entries.push({
      customerId: customer.id,
      company: customer.company,
      contact,
      subtitle: `${contact.name || 'Contact'} · ${tier}`,
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

/** Build a preview grant for any account contact (admin override; portal access not required). */
export function adminPreviewGrant(contact: Contact, customer: Customer): PortalAccessGrant | null {
  const fromPortal = grantFromContact(contact, customer);
  if (fromPortal) return fromPortal;

  return {
    email: previewEmailForContact(contact, customer),
    contactId: contact.id,
    contactName: contact.name || customer.company,
    customerId: customer.id,
    companyName: customer.company,
    tier: 'full',
    locationIds: contact.locationIds ?? [],
    invitedAt: contact.portalInviteSentAt ?? new Date().toISOString(),
  };
}
