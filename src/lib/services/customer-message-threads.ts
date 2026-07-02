import { formatCustomerTicketTime } from '@/lib/services/customer-tickets';

export type CustomerMessageThreadRow = {
  id: string;
  user_id: string;
  subject: string | null;
  category: string;
  status: string;
  updated_at: string;
  created_at?: string;
  customer_name: string;
  customer_email: string;
  last_message?: { body: string; author: string; created_at: string } | null;
};

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

export function formatCustomerMessageThreadTime(iso: string): string {
  return formatCustomerTicketTime(iso);
}

export function customerMessageThreadPreview(thread: CustomerMessageThreadRow): string {
  const body = thread.last_message?.body?.trim();
  if (body) return body.length > 120 ? `${body.slice(0, 117)}…` : body;
  return thread.category || 'Customer message';
}
