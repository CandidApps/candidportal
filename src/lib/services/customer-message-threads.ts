import { formatCustomerTicketTime } from '@/lib/services/customer-tickets';

export type CustomerMessageThreadRow = {
  id: string;
  user_id: string;
  subject: string | null;
  category: string;
  status: string;
  updated_at: string;
  created_at?: string;
  admin_read_at?: string | null;
  analysis_review_id?: string | null;
  customer_name: string;
  customer_email: string;
  last_message?: { body: string; author: string; created_at: string } | null;
};

export const CUSTOMER_MESSAGE_CATEGORY_LABELS: Record<string, string> = {
  bill_analysis: 'Bill analysis',
  supplier_issue: 'Suppliers',
  quote_request: 'Quotes',
  billing: 'Billing',
  technical: 'Technical',
  general: 'General',
};

/** Same type filters as the member Message Center, plus All. */
export const CUSTOMER_MESSAGE_CATEGORY_FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'bill_analysis', label: 'Bill analysis' },
  { key: 'supplier_issue', label: 'Suppliers' },
  { key: 'quote_request', label: 'Quotes' },
  { key: 'billing', label: 'Billing' },
  { key: 'technical', label: 'Technical' },
  { key: 'general', label: 'General' },
];

export function customerMessageCategoryLabel(category: string): string {
  return CUSTOMER_MESSAGE_CATEGORY_LABELS[category] ?? category;
}

/** Primary list/detail title: customer first, then topic. */
export function customerMessageThreadTitle(
  thread: Pick<CustomerMessageThreadRow, 'customer_name' | 'subject' | 'category'>,
): string {
  const who = (thread.customer_name || 'Customer').trim() || 'Customer';
  const topic =
    (thread.subject || '').trim() || customerMessageCategoryLabel(thread.category || 'general');
  return `${who} — ${topic}`;
}

export function isCustomerMessageThreadArchived(
  thread: Pick<CustomerMessageThreadRow, 'status'>,
): boolean {
  return thread.status === 'archived';
}

export function isCustomerMessageThreadOpen(thread: Pick<CustomerMessageThreadRow, 'status'>): boolean {
  return (
    thread.status !== 'closed' &&
    thread.status !== 'resolved' &&
    thread.status !== 'archived'
  );
}

export function isCustomerMessageThreadUnread(
  thread: Pick<CustomerMessageThreadRow, 'status' | 'admin_read_at'>,
): boolean {
  return isCustomerMessageThreadOpen(thread) && !thread.admin_read_at;
}

export function countUnreadCustomerMessageThreads(threads: CustomerMessageThreadRow[]): number {
  return threads.filter(isCustomerMessageThreadUnread).length;
}

export async function fetchCustomerMessageThreadsForAdmin(): Promise<CustomerMessageThreadRow[]> {
  const res = await fetch('/api/admin/customer-messages/threads');
  if (!res.ok) {
    console.error('fetchCustomerMessageThreadsForAdmin', await res.text());
    return [];
  }
  const data = (await res.json()) as { threads?: CustomerMessageThreadRow[] };
  return (data.threads ?? []).map((t) => ({
    ...t,
    customer_name: t.customer_name ?? 'Customer',
    customer_email: t.customer_email ?? '',
  }));
}

export async function patchCustomerMessageThreadRead(
  threadId: string,
  read: boolean,
): Promise<boolean> {
  const res = await fetch(`/api/admin/customer-messages/threads/${threadId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ read }),
  });
  return res.ok;
}

export async function patchCustomerMessageThreadArchive(
  threadId: string,
  archived: boolean,
): Promise<boolean> {
  const res = await fetch(`/api/admin/customer-messages/threads/${threadId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ archived }),
  });
  return res.ok;
}

export async function createAdminCustomerMessageThread(input: {
  email: string;
  body: string;
  subject?: string;
  category?: string;
  notifyMember?: boolean;
  files?: File[];
}): Promise<{ threadId: string } | { error: string }> {
  const hasFiles = Boolean(input.files?.length);
  let res: Response;
  if (hasFiles) {
    const form = new FormData();
    form.set('email', input.email);
    form.set('body', input.body);
    if (input.subject) form.set('subject', input.subject);
    if (input.category) form.set('category', input.category);
    form.set('notifyMember', String(input.notifyMember !== false));
    for (const f of input.files ?? []) form.append('files', f);
    res = await fetch('/api/admin/customer-messages/threads', { method: 'POST', body: form });
  } else {
    res = await fetch('/api/admin/customer-messages/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }
  const data = (await res.json()) as { threadId?: string; error?: string };
  if (!res.ok || !data.threadId) return { error: data.error ?? 'Failed to start conversation' };
  return { threadId: data.threadId };
}

export async function replyAdminCustomerMessageThread(input: {
  threadId: string;
  body: string;
  notifyMember?: boolean;
  files?: File[];
}): Promise<{ ok: true } | { error: string }> {
  const form = new FormData();
  form.set('body', input.body);
  form.set('notifyMember', String(input.notifyMember !== false));
  for (const f of input.files ?? []) form.append('files', f);
  const res = await fetch(`/api/admin/customer-messages/threads/${input.threadId}`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: data.error ?? 'Send failed' };
  }
  return { ok: true };
}

export function formatCustomerMessageThreadTime(iso: string): string {
  return formatCustomerTicketTime(iso);
}

export function customerMessageThreadPreview(thread: CustomerMessageThreadRow): string {
  const body = thread.last_message?.body?.trim();
  if (body) return body.length > 120 ? `${body.slice(0, 117)}…` : body;
  return customerMessageCategoryLabel(thread.category || 'general');
}
