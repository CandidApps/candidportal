import 'server-only';

import { parseEmailAddress } from '@/lib/email/address-parse';
import type { ConversationMessage } from '@/lib/email/zoho';
import { searchConversation } from '@/lib/email/zoho';
import type { AssistantEmailItem } from '@/lib/assistant/types';

const REPLY_TIME_TOLERANCE_MS = 60_000;

function normalizeSubject(subject: string): string {
  return subject.replace(/^(re|fwd):\s*/gi, '').trim().toLowerCase();
}

function subjectsRelated(inboundSubject: string, otherSubject: string): boolean {
  const a = normalizeSubject(inboundSubject);
  const b = normalizeSubject(otherSubject);
  if (!a || !b) return true;
  return a === b || a.includes(b) || b.includes(a);
}

function isFromMailbox(
  msg: Pick<ConversationMessage, 'fromAddress' | 'sender'>,
  mailbox: string,
): boolean {
  const mb = mailbox.trim().toLowerCase();
  const from = parseEmailAddress(msg.fromAddress || msg.sender || '');
  return Boolean(from && from === mb);
}

function isFromContact(msg: Pick<ConversationMessage, 'fromAddress'>, contactEmail: string): boolean {
  return parseEmailAddress(msg.fromAddress) === contactEmail.trim().toLowerCase();
}

/**
 * True when the user already replied to this inbound message outside CandidIQ
 * (e.g. in Zoho) and the contact has not sent a newer inbound since that reply.
 * If the contact did follow up after the user's reply, only the latest inbound
 * should remain actionable — older messages in the thread are treated as handled.
 */
export function isInboundHandledExternally(
  inbound: Pick<AssistantEmailItem, 'id' | 'subject' | 'receivedTime' | 'fromAddress' | 'from'>,
  mailbox: string,
  conversation: ConversationMessage[],
): boolean {
  const contactEmail = parseEmailAddress(inbound.fromAddress || inbound.from);
  if (!contactEmail || !contactEmail.includes('@')) return false;

  const inboundTime = inbound.receivedTime;
  if (!inboundTime) return false;

  const userReplyAfterInbound = conversation.find(
    (m) =>
      isFromMailbox(m, mailbox) &&
      m.receivedTime >= inboundTime - REPLY_TIME_TOLERANCE_MS &&
      subjectsRelated(inbound.subject, m.subject),
  );
  if (!userReplyAfterInbound) return false;

  const newerInboundAfterReply = conversation.find(
    (m) =>
      isFromContact(m, contactEmail) &&
      m.receivedTime > userReplyAfterInbound.receivedTime + REPLY_TIME_TOLERANCE_MS,
  );

  if (!newerInboundAfterReply) return true;

  // Contact followed up — only the newest inbound in the thread needs action.
  return newerInboundAfterReply.messageId !== inbound.id;
}

export function detectExternallyHandledEmailIds(
  inbox: AssistantEmailItem[],
  mailbox: string,
  conversationsByContact: Map<string, ConversationMessage[]>,
): string[] {
  const mb = mailbox.trim().toLowerCase();
  const handled: string[] = [];

  for (const item of inbox) {
    const contactEmail = parseEmailAddress(item.fromAddress || item.from);
    if (!contactEmail || contactEmail === mb) continue;
    const conversation = conversationsByContact.get(contactEmail);
    if (!conversation?.length) continue;
    if (isInboundHandledExternally(item, mailbox, conversation)) {
      handled.push(item.id);
    }
  }

  return handled;
}

function uniqueContactEmails(inbox: AssistantEmailItem[], mailbox: string): string[] {
  const mb = mailbox.trim().toLowerCase();
  const emails = new Set<string>();
  for (const item of inbox) {
    const addr = parseEmailAddress(item.fromAddress || item.from);
    if (addr && addr !== mb && addr.includes('@')) emails.add(addr);
  }
  return [...emails];
}

async function loadConversationsByContact(
  accessToken: string,
  accountId: string,
  contactEmails: string[],
): Promise<Map<string, ConversationMessage[]>> {
  const map = new Map<string, ConversationMessage[]>();
  const batchSize = 6;

  for (let i = 0; i < contactEmails.length; i += batchSize) {
    const batch = contactEmails.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (email) => {
        try {
          const messages = await searchConversation({
            accessToken,
            accountId,
            email,
            limit: 20,
          });
          return [email, messages] as const;
        } catch {
          return [email, [] as ConversationMessage[]] as const;
        }
      }),
    );
    for (const [email, messages] of results) map.set(email, messages);
  }

  return map;
}

/** Loads Zoho thread history and returns inbox message ids already replied to externally. */
export async function resolveExternallyHandledEmailIds(input: {
  accessToken: string;
  accountId: string;
  mailbox: string;
  inbox: AssistantEmailItem[];
}): Promise<string[]> {
  const contacts = uniqueContactEmails(input.inbox, input.mailbox);
  if (contacts.length === 0) return [];

  const conversations = await loadConversationsByContact(
    input.accessToken,
    input.accountId,
    contacts,
  );
  return detectExternallyHandledEmailIds(input.inbox, input.mailbox, conversations);
}
