'use client';

import { useMemo } from 'react';

import { CustomerEmailPanel, type MailContact } from '@/components/customers/CustomerEmailPanel';

/** Module-level so the default prop keeps a stable identity across renders. */
const NO_CONTACTS: MailContact[] = [];

export function PartnerEmailPanel({
  entityName,
  contactEmail,
  contactName,
  extraContacts = NO_CONTACTS,
}: {
  entityName: string;
  contactEmail?: string | null;
  contactName?: string | null;
  extraContacts?: MailContact[];
}) {
  const primaryEmail =
    contactEmail?.trim() ||
    extraContacts.find((contact) => contact.email?.trim())?.email?.trim() ||
    undefined;
  const primaryName = contactName?.trim() || entityName;
  const contacts = useMemo(
    () =>
      extraContacts.filter(
        (contact) =>
          contact.email?.trim() &&
          contact.email.trim().toLowerCase() !== primaryEmail?.toLowerCase(),
      ),
    [extraContacts, primaryEmail],
  );

  if (!primaryEmail && contacts.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--gray)' }}>
        No email contacts on file for this partner.
      </p>
    );
  }

  return (
    <CustomerEmailPanel
      email={primaryEmail}
      customerName={primaryName}
      contacts={contacts}
    />
  );
}

export default PartnerEmailPanel;
