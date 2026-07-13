import { findCustomerByContactEmail } from '@/lib/crm/customer-lookup';
import type { Customer } from '@/components/CustomersView';
import type { AssistantEmailItem, PortalContact } from '@/lib/assistant/types';

export type EmailSenderKind = 'customer' | 'supplier' | 'agent' | 'internal' | 'unknown';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

import { parseEmailAddress, splitEmailAddresses } from '@/lib/email/address-parse';

function parseRecipientEmails(raw: string): string[] {
  return splitEmailAddresses(raw);
}

export function recipientIncludesEmail(recipientsRaw: string, userEmail: string): boolean {
  const wanted = userEmail.trim().toLowerCase();
  if (!wanted) return false;
  return parseRecipientEmails(recipientsRaw).includes(wanted);
}

export function mentionsUserName(text: string, displayName: string): boolean {
  const hay = text.toLowerCase();
  const parts = displayName
    .trim()
    .split(/\s+/)
    .filter((part) => part.length >= 2);
  if (!parts.length) return false;
  return parts.some((part) => new RegExp(`\\b${escapeRegExp(part.toLowerCase())}\\b`).test(hay));
}

export function classifyEmailSender(
  fromEmail: string,
  contactDirectory: Map<string, PortalContact>,
  customers: Customer[],
  agentEmails: Set<string>,
): EmailSenderKind {
  const lc = fromEmail.trim().toLowerCase();
  if (!lc) return 'unknown';

  const dir = contactDirectory.get(lc);
  if (dir?.type === 'team') return 'internal';
  if (dir?.type === 'supplier') return 'supplier';
  if (dir?.type === 'account') return 'customer';
  if (findCustomerByContactEmail(customers, lc)) return 'customer';
  if (agentEmails.has(lc)) return 'agent';
  return 'unknown';
}

export function shouldAutoPrioritizeEmail(
  item: AssistantEmailItem,
  ctx: {
    userEmail: string;
    userDisplayName: string;
    contactDirectory: Map<string, PortalContact>;
    customers: Customer[];
    agentEmails: Set<string>;
  },
): { reason: string; tag: 'customer' | 'partner' | 'urgent' } | null {
  const fromEmail = (item.fromAddress || '').trim().toLowerCase();
  if (!fromEmail) return null;

  const senderKind = classifyEmailSender(
    fromEmail,
    ctx.contactDirectory,
    ctx.customers,
    ctx.agentEmails,
  );
  if (senderKind === 'internal' || senderKind === 'unknown') return null;

  const userEmail = ctx.userEmail.trim().toLowerCase();
  if (
    senderKind === 'customer'
    && userEmail
    && recipientIncludesEmail(item.to, userEmail)
  ) {
    return { reason: 'Direct email from a customer — you are on To.', tag: 'customer' };
  }

  const mentionText = `${item.subject} ${item.summary}`;
  if (mentionsUserName(mentionText, ctx.userDisplayName)) {
    if (senderKind === 'customer') {
      return { reason: 'A customer mentioned you in this message.', tag: 'customer' };
    }
    if (senderKind === 'supplier') {
      return { reason: 'A supplier/partner mentioned you in this message.', tag: 'partner' };
    }
    if (senderKind === 'agent') {
      return { reason: 'An agent mentioned you in this message.', tag: 'urgent' };
    }
  }

  return null;
}
