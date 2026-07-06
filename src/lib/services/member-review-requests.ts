import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import type { CustomerAction } from '@/lib/portal-import/merge';
import { formatCustomerTicketTime } from '@/lib/services/customer-tickets';

export type MemberReviewRequestSource = 'savings_opportunity' | 'my_services';
export type MemberReviewRequestStatus = 'open' | 'in_progress' | 'resolved';

export type MemberReviewRequestRow = {
  id: string;
  user_id: string;
  account_service_id: string | null;
  analysis_review_id: string | null;
  crm_customer_id: string | null;
  request_source: MemberReviewRequestSource;
  service_name: string;
  vendor_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  subject: string;
  message: string | null;
  status: MemberReviewRequestStatus;
  created_at: string;
  updated_at: string;
};

type DbRow = {
  id: string;
  user_id: string;
  account_service_id: string | null;
  analysis_review_id: string | null;
  crm_customer_id: string | null;
  request_source: MemberReviewRequestSource;
  service_name: string;
  vendor_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  subject: string;
  message: string | null;
  status: MemberReviewRequestStatus;
  created_at: string;
  updated_at: string;
};

function mapRow(row: DbRow): MemberReviewRequestRow {
  return {
    id: row.id,
    user_id: row.user_id,
    account_service_id: row.account_service_id,
    analysis_review_id: row.analysis_review_id,
    crm_customer_id: row.crm_customer_id,
    request_source: row.request_source,
    service_name: row.service_name,
    vendor_name: row.vendor_name,
    customer_name: row.customer_name,
    customer_email: row.customer_email,
    subject: row.subject,
    message: row.message,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function reviewRequestActionId(id: string): string {
  return `review-req-${id}`;
}

export function reviewRequestToCustomerAction(req: MemberReviewRequestRow): CustomerAction {
  const detailParts = [
    req.message?.trim(),
    req.vendor_name ? `Vendor: ${req.vendor_name}` : null,
    req.request_source === 'savings_opportunity' ? 'From My Savings Opportunities' : 'From My Services',
  ].filter(Boolean);
  return {
    id: reviewRequestActionId(req.id),
    kind: 'custom',
    severity: 'soon',
    title: req.subject,
    detail: detailParts.join(' · ') || req.service_name,
    suggestedAction: 'Member requested a Candid review — coordinate savings, contract, or termination options.',
    source: 'custom',
  };
}

export async function fetchMemberReviewRequestsForAdmin(): Promise<MemberReviewRequestRow[]> {
  const res = await fetch('/api/admin/member-review-requests');
  if (!res.ok) {
    console.error('fetchMemberReviewRequestsForAdmin', await res.text());
    return [];
  }
  const data = (await res.json()) as { requests?: DbRow[] };
  return ((data.requests ?? []) as DbRow[]).map(mapRow);
}

export async function fetchMemberReviewRequestsForUser(userId: string): Promise<MemberReviewRequestRow[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('member_review_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('fetchMemberReviewRequestsForUser', error);
    return [];
  }
  return ((data as DbRow[]) ?? []).map(mapRow);
}

export async function insertMemberReviewRequest(input: {
  userId: string;
  accountServiceId?: string | null;
  analysisReviewId?: string | null;
  crmCustomerId?: string | null;
  requestSource: MemberReviewRequestSource;
  serviceName: string;
  vendorName?: string | null;
  customerName: string;
  customerEmail: string;
  subject: string;
  message: string;
}): Promise<MemberReviewRequestRow | null> {
  const supabase = createSupabaseBrowserClient();

  if (input.accountServiceId) {
    const { data: existing } = await supabase
      .from('member_review_requests')
      .select('id')
      .eq('user_id', input.userId)
      .eq('account_service_id', input.accountServiceId)
      .in('status', ['open', 'in_progress'])
      .maybeSingle();
    if (existing) {
      throw new Error('You already have an open review request for this service.');
    }
  }

  const { data, error } = await supabase
    .from('member_review_requests')
    .insert({
      user_id: input.userId,
      account_service_id: input.accountServiceId ?? null,
      analysis_review_id: input.analysisReviewId ?? null,
      crm_customer_id: input.crmCustomerId ?? null,
      request_source: input.requestSource,
      service_name: input.serviceName,
      vendor_name: input.vendorName ?? null,
      customer_name: input.customerName,
      customer_email: input.customerEmail,
      subject: input.subject,
      message: input.message,
      status: 'open',
    })
    .select('*')
    .single();

  if (error) {
    console.error('insertMemberReviewRequest', error);
    throw new Error(error.message);
  }
  return mapRow(data as DbRow);
}

export async function updateMemberReviewRequestStatus(
  id: string,
  status: MemberReviewRequestStatus,
  options?: { replyMessage?: string; notifyMember?: boolean },
): Promise<boolean> {
  const res = await fetch(`/api/admin/member-review-requests/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status,
      replyMessage: options?.replyMessage,
      notifyMember: options?.notifyMember,
    }),
  });
  if (!res.ok) {
    console.error('updateMemberReviewRequestStatus', await res.text());
    return false;
  }
  return true;
}

export function formatReviewRequestTime(iso: string): string {
  return formatCustomerTicketTime(iso);
}

export function openReviewRequestsForCustomer(
  requests: MemberReviewRequestRow[],
  customerId: string,
  customerEmails: Set<string>,
): MemberReviewRequestRow[] {
  return requests.filter((req) => {
    if (req.status === 'resolved') return false;
    if (req.crm_customer_id === customerId) return true;
    const email = req.customer_email?.trim().toLowerCase();
    return Boolean(email && customerEmails.has(email));
  });
}
