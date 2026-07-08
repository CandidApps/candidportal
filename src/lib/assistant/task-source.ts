import type {
  AssistantAction,
  AssistantCall,
  AssistantEmailItem,
  AssistantRecap,
  AssistantRef,
  AssistantTask,
  TriagedEmail,
} from '@/lib/assistant/types';

export type AssistantTaskSourceMeta = {
  refType?: 'email' | 'action' | 'call' | 'recap' | 'mention' | 'contact' | 'customer';
  refId?: string;
  emailId?: string;
  folderId?: string;
  messageId?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactName?: string | null;
  customerId?: string | null;
  actionKind?: string | null;
  sourceId?: string | null;
  subject?: string | null;
};

import { normalizeAddressField, parseEmailAddress } from '@/lib/email/address-parse';

export function parseTaskSourceMeta(raw: unknown): AssistantTaskSourceMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as AssistantTaskSourceMeta;
}

export type SourceMetaLookup = {
  inboxById: Map<string, AssistantEmailItem>;
  triagedById: Map<string, TriagedEmail>;
  actionById: Map<string, AssistantAction>;
  callById: Map<string, AssistantCall>;
  recapById: Map<string, AssistantRecap>;
};

export function sourceMetaFromRef(
  ref: AssistantRef | null | undefined,
  lookup: SourceMetaLookup,
): AssistantTaskSourceMeta | null {
  if (!ref) return null;
  switch (ref.type) {
    case 'email': {
      const inbox = lookup.inboxById.get(ref.id);
      if (inbox) return sourceMetaFromEmail(inbox);
      const triaged = lookup.triagedById.get(ref.id);
      if (triaged) return sourceMetaFromTriagedEmail(triaged);
      return { refType: 'email', refId: ref.id, emailId: ref.id };
    }
    case 'action': {
      const action = lookup.actionById.get(ref.id);
      return action
        ? sourceMetaFromAction(action)
        : { refType: 'action', refId: ref.id, sourceId: ref.id };
    }
    case 'call': {
      const call = lookup.callById.get(ref.id);
      return call ? sourceMetaFromCall(call) : { refType: 'call', refId: ref.id };
    }
    case 'recap': {
      const recap = lookup.recapById.get(ref.id);
      return recap ? sourceMetaFromRecap(recap) : { refType: 'recap', refId: ref.id };
    }
    case 'mention':
      return { refType: 'mention', refId: ref.id };
    case 'calendar':
    case 'task':
      return null;
  }
}

/** Fills in source meta from sourceRef when older tasks were saved without it. */
export function resolveTaskSourceMeta(
  task: Pick<AssistantTask, 'sourceMeta' | 'sourceRef' | 'source'>,
  lookup: SourceMetaLookup,
): AssistantTaskSourceMeta | null {
  if (task.sourceMeta) return task.sourceMeta;
  const ref = task.sourceRef?.trim();
  if (!ref) return null;
  const colon = ref.indexOf(':');
  const kind = colon >= 0 ? ref.slice(0, colon) : task.source;
  const id = colon >= 0 ? ref.slice(colon + 1) : ref;
  if (!id) return null;
  switch (kind) {
    case 'email':
      return sourceMetaFromRef({ type: 'email', id }, lookup);
    case 'call':
      return sourceMetaFromRef({ type: 'call', id }, lookup);
    case 'recap':
      return sourceMetaFromRef({ type: 'recap', id: id.split(':')[0] ?? id }, lookup);
    case 'action':
      return sourceMetaFromRef({ type: 'action', id }, lookup);
    default:
      return null;
  }
}

export function sourceMetaFromEmail(
  item: Pick<AssistantEmailItem, 'id' | 'folderId' | 'from' | 'fromAddress' | 'subject'>,
): AssistantTaskSourceMeta {
  const contactEmail = item.fromAddress || parseEmailAddress(item.from);
  return {
    refType: 'email',
    refId: item.id,
    emailId: item.id,
    folderId: item.folderId,
    contactEmail,
    contactName:
      normalizeAddressField(item.from).replace(/<[^>]+>/g, '').replace(/^["']+|["']+$/g, '').trim()
      || contactEmail,
    subject: item.subject,
  };
}

export function sourceMetaFromTriagedEmail(item: {
  id: string;
  contact: string;
  subject: string;
}): AssistantTaskSourceMeta {
  return {
    refType: 'email',
    refId: item.id,
    emailId: item.id,
    contactEmail: parseEmailAddress(item.contact),
    contactName: item.contact,
    subject: item.subject,
  };
}

export function sourceMetaFromAction(action: AssistantAction): AssistantTaskSourceMeta {
  return {
    refType: 'action',
    refId: action.id,
    actionKind: action.kind,
    sourceId: action.sourceId,
    contactEmail: action.customerEmail,
    contactName: action.who || null,
    customerId: action.customerId,
    subject: action.title,
  };
}

export function sourceMetaFromCall(call: AssistantCall): AssistantTaskSourceMeta {
  return {
    refType: 'call',
    refId: call.id,
    contactEmail: call.contactEmail,
    contactPhone: call.contactPhone,
    contactName: call.contactName,
    customerId: call.customerId,
  };
}

export function sourceMetaFromRecap(recap: AssistantRecap): AssistantTaskSourceMeta {
  const contactEmail = parseEmailAddress(recap.from);
  return {
    refType: 'recap',
    refId: recap.id,
    emailId: recap.id,
    folderId: recap.folderId,
    contactEmail,
    contactName: recap.from,
    subject: recap.title,
  };
}

export function sourceMetaFromContact(input: {
  email: string;
  name: string;
  phone?: string | null;
  customerId?: string | null;
}): AssistantTaskSourceMeta {
  return {
    refType: 'contact',
    contactEmail: input.email,
    contactName: input.name,
    contactPhone: input.phone ?? null,
    customerId: input.customerId ?? null,
  };
}

export const TASK_SLASH_COMMANDS = [
  { id: 'call', label: 'Link contact for call', hint: '/call' },
  { id: 'email', label: 'Link contact for email', hint: '/email' },
  { id: 'contact', label: 'Link contact (call + email)', hint: '/contact' },
  { id: 'customer', label: 'Link CRM customer', hint: '/customer' },
] as const;

export type TaskSlashCommandId = (typeof TASK_SLASH_COMMANDS)[number]['id'];
