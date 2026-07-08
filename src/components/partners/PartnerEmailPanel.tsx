'use client';

import { CustomerEmailPanel, type MailContact } from '@/components/customers/CustomerEmailPanel';

export function PartnerEmailPanel({
  entityName,
  contactEmail,
  contactName,
  extraContacts = [],
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
  const contacts = extraContacts.filter(
    (contact) =>
      contact.email?.trim() &&
      contact.email.trim().toLowerCase() !== primaryEmail?.toLowerCase(),
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
