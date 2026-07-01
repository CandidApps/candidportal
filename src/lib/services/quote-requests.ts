import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { QUOTE_SERVICE_TYPES } from '@/lib/quote-flow-config';
import { formatCustomerTicketTime } from '@/lib/services/customer-tickets';

export type QuoteRequestMode = 'request' | 'add-services';
export type QuoteRequestStatus = 'open' | 'in_progress' | 'resolved' | 'submitted';

export type QuoteRequestLocation = {
  id?: string;
  label?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
};

export type QuoteRequestRow = {
  id: string;
  user_id: string;
  mode: QuoteRequestMode;
  contact_name: string | null;
  company: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  services: string[];
  note: string | null;
  service_type_id: string | null;
  service_answers: Record<string, string | boolean> | null;
  vendor_names: string[] | null;
  location: QuoteRequestLocation | null;
  subject: string | null;
  status: QuoteRequestStatus;
  created_at: string;
  updated_at: string;
};

type DbRow = {
  id: string;
  user_id: string;
  mode: QuoteRequestMode;
  contact_name: string | null;
  company: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  services: string[] | null;
  note: string | null;
  service_type_id: string | null;
  service_answers: Record<string, string | boolean> | null;
  vendor_names: string[] | null;
  location: QuoteRequestLocation | null;
  subject: string | null;
  status: QuoteRequestStatus;
  created_at: string;
  updated_at: string;
};

function mapRow(row: DbRow): QuoteRequestRow {
  return {
    id: row.id,
    user_id: row.user_id,
    mode: row.mode,
    contact_name: row.contact_name,
    company: row.company,
    contact_email: row.contact_email,
    contact_phone: row.contact_phone,
    services: row.services ?? [],
    note: row.note,
    service_type_id: row.service_type_id,
    service_answers: row.service_answers,
    vendor_names: row.vendor_names,
    location: row.location,
    subject: row.subject,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function quoteRequestActionId(id: string): string {
  return `quote-req-${id}`;
}

export function normalizeQuoteRequestStatus(status: QuoteRequestStatus): 'open' | 'in_progress' | 'resolved' {
  if (status === 'resolved') return 'resolved';
  if (status === 'in_progress') return 'in_progress';
  return 'open';
}

export function serviceTypeLabel(serviceTypeId: string | null | undefined): string {
  if (!serviceTypeId) return 'Services';
  return QUOTE_SERVICE_TYPES.find((t) => t.id === serviceTypeId)?.label ?? serviceTypeId;
}

export function buildQuoteRequestSubject(input: {
  mode?: QuoteRequestMode;
  company?: string | null;
  serviceTypeId?: string | null;
  services?: string[];
}): string {
  const serviceLabel = input.serviceTypeId
    ? serviceTypeLabel(input.serviceTypeId)
    : (input.services ?? []).filter(Boolean).join(', ') || 'Services';
  const company = input.company?.trim();
  if (input.mode === 'add-services') {
    return company ? `Add services — ${company}` : `Add services — ${serviceLabel}`;
  }
  return company ? `Quote request — ${serviceLabel} (${company})` : `Quote request — ${serviceLabel}`;
}

export function formatQuoteRequestDetail(row: QuoteRequestRow): string {
  const parts = [
    serviceTypeLabel(row.service_type_id),
    row.vendor_names?.length ? `Vendors: ${row.vendor_names.join(', ')}` : null,
    row.location?.city ? `Location: ${[row.location.city, row.location.state].filter(Boolean).join(', ')}` : null,
    row.note?.trim() || null,
  ].filter(Boolean);
  return parts.join(' — ') || row.services.join(', ') || 'Quote request';
}

export function formatQuoteRequestAnswers(row: QuoteRequestRow): { label: string; value: string }[] {
  if (!row.service_type_id || !row.service_answers) return [];
  const type = QUOTE_SERVICE_TYPES.find((t) => t.id === row.service_type_id);
  if (!type) return [];

  return type.questions
    .map((q) => {
      const raw = row.service_answers?.[q.id];
      if (raw === undefined || raw === '') return null;
      const value =
        q.type === 'boolean'
          ? raw === true || raw === 'true'
            ? 'Yes'
            : 'No'
          : String(raw);
      return { label: q.label, value };
    })
    .filter(Boolean) as { label: string; value: string }[];
}

export async function fetchQuoteRequestsForAdmin(): Promise<QuoteRequestRow[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('quote_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    console.error('fetchQuoteRequestsForAdmin', error);
    return [];
  }
  return ((data as DbRow[]) ?? []).map(mapRow);
}

export async function updateQuoteRequestStatus(
  id: string,
  status: 'open' | 'in_progress' | 'resolved',
  options?: { replyMessage?: string; notifyMember?: boolean },
): Promise<boolean> {
  const res = await fetch(`/api/admin/quote-requests/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status,
      replyMessage: options?.replyMessage,
      notifyMember: options?.notifyMember,
    }),
  });
  if (!res.ok) {
    console.error('updateQuoteRequestStatus', await res.text());
    return false;
  }
  return true;
}

export function formatQuoteRequestTime(iso: string): string {
  return formatCustomerTicketTime(iso);
}
