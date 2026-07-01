import type {
  AssistantAction,
  AssistantCall,
  AssistantEmailItem,
  AssistantRecap,
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

function emailAddr(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim();
}

export function parseTaskSourceMeta(raw: unknown): AssistantTaskSourceMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as AssistantTaskSourceMeta;
}

export function sourceMetaFromEmail(
  item: Pick<AssistantEmailItem, 'id' | 'folderId' | 'from' | 'fromAddress' | 'subject'>,
): AssistantTaskSourceMeta {
  const contactEmail = item.fromAddress || emailAddr(item.from);
  return {
    refType: 'email',
    refId: item.id,
    emailId: item.id,
    folderId: item.folderId,
    contactEmail,
    contactName: item.from.replace(/<[^>]+>/, '').trim() || contactEmail,
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
    contactEmail: emailAddr(item.contact),
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
  const contactEmail = emailAddr(recap.from);
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
