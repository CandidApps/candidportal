import type { ServiceRequestCategory } from '@/lib/service-request-config';
import { formatCustomerTicketTime } from '@/lib/services/customer-tickets';

export type MemberServiceRequestOutcome = 'self_service' | 'escalated_ticket' | 'escalated_review';

export type MemberServiceRequestStatus =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'resolved_self_service';

export type MemberServiceRequestRow = {
  id: string;
  user_id: string;
  category: ServiceRequestCategory;
  subject: string;
  message: string | null;
  status: MemberServiceRequestStatus;
  outcome: MemberServiceRequestOutcome;
  account_service_id: string | null;
  service_name: string | null;
  vendor_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  guide_id: string | null;
  guide_title: string | null;
  linked_ticket_id: string | null;
  linked_review_request_id: string | null;
  created_at: string;
  updated_at: string;
};

type DbRow = MemberServiceRequestRow;

function mapRow(row: DbRow): MemberServiceRequestRow {
  return { ...row };
}

export function formatMemberServiceRequestTime(iso: string): string {
  return formatCustomerTicketTime(iso);
}

export async function fetchMemberServiceRequestsForMember(): Promise<MemberServiceRequestRow[]> {
  const res = await fetch('/api/portal/service-requests');
  if (!res.ok) {
    console.error('fetchMemberServiceRequestsForMember', await res.text());
    return [];
  }
  const data = (await res.json()) as { requests?: DbRow[] };
  return ((data.requests ?? []) as DbRow[]).map(mapRow);
}

export async function fetchMemberServiceRequestsForAdmin(): Promise<MemberServiceRequestRow[]> {
  const res = await fetch('/api/admin/member-service-requests');
  if (!res.ok) {
    console.error('fetchMemberServiceRequestsForAdmin', await res.text());
    return [];
  }
  const data = (await res.json()) as { requests?: DbRow[] };
  return ((data.requests ?? []) as DbRow[]).map(mapRow);
}

export type SubmitServiceRequestInput = {
  category: ServiceRequestCategory;
  outcome: 'self_service' | 'escalated';
  message?: string;
  serviceName: string;
  vendorName?: string;
  customerName?: string;
  customerEmail?: string;
  accountServiceId?: string;
  analysisReviewId?: string;
  crmCustomerId?: string;
  requestSource?: 'savings_opportunity' | 'my_services';
  guideId?: string;
  guideTitle?: string;
  /** Seats/licenses being added (additional_services). */
  addedSeatCount?: number;
};

export async function submitMemberServiceRequest(
  input: SubmitServiceRequestInput,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/portal/service-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: data.error ?? 'Request failed' };
  return { ok: true };
}
