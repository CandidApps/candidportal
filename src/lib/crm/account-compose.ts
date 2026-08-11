import type { ConversationMessage } from '@/lib/email/client';
import { launchAdminZohoCompose, type AdminComposeLaunch } from '@/lib/email/admin-compose';

export type AccountComposeContact = { name: string; email: string; role?: string };

export function collectAccountMailContacts(
  contacts: { name: string; email?: string; altEmail?: string; role?: string }[],
): AccountComposeContact[] {
  const out: AccountComposeContact[] = [];
  const seen = new Set<string>();
  const add = (name: string, email: string, role?: string) => {
    const e = email.trim().toLowerCase();
    if (!e || !e.includes('@') || seen.has(e)) return;
    seen.add(e);
    out.push({ name, email: email.trim(), role });
  };
  for (const c of contacts) {
    if (c.email?.trim()) add(c.name, c.email, c.role);
    if (c.altEmail?.trim()) add(c.name, c.altEmail, c.role ? `${c.role} · alt` : 'Alt email');
  }
  return out;
}

function replySubject(subject: string): string {
  const s = subject.trim();
  if (/^re:/i.test(s)) return s;
  return `Re: ${s}`;
}

function splitRecipients(value: string): string[] {
  return value
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinUnique(existing: string, add: string): string {
  const set = new Set(splitRecipients(existing).map((e) => e.toLowerCase()));
  const next = [...splitRecipients(existing)];
  for (const e of splitRecipients(add)) {
    const key = e.toLowerCase();
    if (!set.has(key)) {
      set.add(key);
      next.push(e);
    }
  }
  return next.join(', ');
}

export function launchAccountEmailCompose(input: {
  contextLabel: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  accountContacts: AccountComposeContact[];
  reply?: {
    message: ConversationMessage;
    lookupEmail: string;
    quotedHtml?: string;
    inbound: boolean;
  };
}): void {
  const replyTo = input.reply
    ? input.reply.inbound
      ? input.reply.message.fromAddress
      : input.to ?? input.reply.lookupEmail
    : input.to;

  const detail: AdminComposeLaunch = {
    contextLabel: input.contextLabel,
    to: replyTo,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.reply ? replySubject(input.reply.message.subject) : input.subject ?? '',
    accountContacts: input.accountContacts,
    lookupEmail: input.reply?.lookupEmail,
    messageId: input.reply?.message.messageId,
    folderId: input.reply?.message.folderId,
    mode: input.reply ? 'reply' : 'new',
    html: input.reply?.quotedHtml
      ? `<p><br></p><blockquote style="margin:0;border-left:3px solid #e2e8f0;padding-left:12px;color:#64748b">${input.reply.quotedHtml}</blockquote>`
      : undefined,
  };
  launchAdminZohoCompose(detail);
}

export function addContactToComposeField(
  existing: string,
  email: string,
  field: 'to' | 'cc' | 'bcc',
): string {
  return joinUnique(existing, email);
}

export type { AdminComposeLaunch };
