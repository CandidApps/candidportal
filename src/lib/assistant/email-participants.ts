import {
  normalizeAddressField,
  parseEmailAddress,
  splitEmailAddresses,
  splitRecipientParts,
} from '@/lib/email/address-parse';
import type { AssistantEmailItem } from '@/lib/assistant/types';

export type EmailParticipant = {
  name: string;
  email: string;
  role: 'from' | 'to' | 'cc';
};

function displayName(raw: string, email: string): string {
  const name = normalizeAddressField(raw)
    .replace(/<[^>]+>/g, '')
    .replace(/^["']+|["']+$/g, '')
    .trim();
  return name && name.toLowerCase() !== email.toLowerCase() ? name : email;
}

/** Unique participants on a message (from / to / cc), excluding the mailbox. */
export function participantsFromEmail(
  item: Pick<AssistantEmailItem, 'from' | 'fromAddress' | 'to' | 'cc'>,
  mailbox = '',
): EmailParticipant[] {
  const mailboxLc = mailbox.trim().toLowerCase();
  const out: EmailParticipant[] = [];
  const seen = new Set<string>();

  const push = (raw: string, role: EmailParticipant['role']) => {
    const email = parseEmailAddress(raw) || splitEmailAddresses(raw)[0] || '';
    const addr = email.trim().toLowerCase();
    if (!addr.includes('@') || seen.has(addr)) return;
    if (mailboxLc && addr === mailboxLc) return;
    seen.add(addr);
    out.push({ name: displayName(raw, email), email: email.trim(), role });
  };

  push(item.fromAddress || item.from, 'from');
  for (const part of splitRecipientParts(item.to)) {
    push(part.name ? `${part.name} <${part.email}>` : part.email, 'to');
  }
  for (const part of splitRecipientParts(item.cc)) {
    push(part.name ? `${part.name} <${part.email}>` : part.email, 'cc');
  }
  return out;
}

/** Comma-separated attendee emails for calendar invite draft. */
export function attendeeEmailsFromEmail(
  item: Pick<AssistantEmailItem, 'from' | 'fromAddress' | 'to' | 'cc'>,
  mailbox = '',
): string {
  return participantsFromEmail(item, mailbox)
    .map((p) => p.email)
    .join(', ');
}

export function meetingTitleFromEmail(subject: string): string {
  const cleaned = subject.replace(/^(re|fwd|fw)\s*:\s*/gi, '').trim();
  return cleaned ? `Meeting: ${cleaned}` : 'Meeting';
}
