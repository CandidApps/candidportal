import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export type CustomerTicketStatus = 'open' | 'in_progress' | 'resolved';

export type CustomerTicketRow = {
  id: string;
  user_id: string;
  service_id: string;
  service_name: string;
  subject: string;
  message: string;
  status: CustomerTicketStatus;
  customer_name: string;
  customer_email: string;
  created_at: string;
  updated_at: string;
};

type DbRow = {
  id: string;
  user_id: string;
  account_service_id: string | null;
  service_name: string;
  subject: string;
  message: string;
  status: CustomerTicketStatus;
  customer_name: string | null;
  customer_email: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: DbRow): CustomerTicketRow {
  return {
    id: row.id,
    user_id: row.user_id,
    service_id: row.account_service_id ?? '',
    service_name: row.service_name,
    subject: row.subject,
    message: row.message,
    status: row.status,
    customer_name: row.customer_name ?? '',
    customer_email: row.customer_email ?? '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function formatCustomerTicketTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** All customer tickets for admin tickets queue */
export async function fetchAllCustomerTicketsForAdmin(): Promise<CustomerTicketRow[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('customer_service_tickets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('fetchAllCustomerTicketsForAdmin', error);
    return [];
  }
  return ((data as DbRow[]) ?? []).map(mapRow);
}

/** Open tickets for admin dashboard */
export async function fetchOpenCustomerTicketsForAdmin(): Promise<CustomerTicketRow[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('customer_service_tickets')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('fetchOpenCustomerTicketsForAdmin', error);
    return [];
  }
  return ((data as DbRow[]) ?? []).map(mapRow);
}

/** All non-resolved tickets for the signed-in member */
export async function fetchCustomerTicketsForUser(userId: string): Promise<CustomerTicketRow[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('customer_service_tickets')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['open', 'in_progress'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchCustomerTicketsForUser', error);
    return [];
  }
  return ((data as DbRow[]) ?? []).map(mapRow);
}

export async function insertCustomerTicket(input: {
  userId: string;
  serviceId: string;
  serviceName: string;
  subject: string;
  message: string;
  customerName: string;
  customerEmail: string;
}): Promise<CustomerTicketRow | null> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('customer_service_tickets')
    .insert({
      user_id: input.userId,
      account_service_id: input.serviceId || null,
      service_name: input.serviceName,
      subject: input.subject,
      message: input.message,
      customer_name: input.customerName,
      customer_email: input.customerEmail,
      status: 'open',
    })
    .select('*')
    .single();

  if (error) {
    console.error('insertCustomerTicket', error);
    return null;
  }
  return mapRow(data as DbRow);
}

export async function resolveCustomerTicket(ticketId: string): Promise<boolean> {
  return updateCustomerTicketStatus(ticketId, 'resolved');
}

/** Admin status update with optional member email (respects notification preferences). */
export async function updateCustomerTicketStatusAdmin(
  ticketId: string,
  status: CustomerTicketStatus,
  options?: { replyMessage?: string; notifyMember?: boolean },
): Promise<boolean> {
  const res = await fetch(`/api/admin/customer-tickets/${ticketId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status,
      replyMessage: options?.replyMessage,
      notifyMember: options?.notifyMember,
    }),
  });
  if (!res.ok) {
    console.error('updateCustomerTicketStatusAdmin', await res.text());
    return false;
  }
  return true;
}

export async function updateCustomerTicketStatus(
  ticketId: string,
  status: CustomerTicketStatus,
): Promise<boolean> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase
    .from('customer_service_tickets')
    .update({ status })
    .eq('id', ticketId);

  if (error) {
    console.error('updateCustomerTicketStatus', error);
    return false;
  }
  return true;
}
