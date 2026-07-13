import type { SupabaseClient } from '@supabase/supabase-js';
import { QUOTE_SERVICE_TYPES, quoteServiceIdFromLabel } from '@/lib/quote-flow-config';
import type { PublishedQuoteSnapshot } from '@/lib/quotes/types';
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
  draft_quote_snapshot: PublishedQuoteSnapshot | null;
  published_quote_snapshot: PublishedQuoteSnapshot | null;
  published_at: string | null;
  admin_notes: string | null;
  customer_accepted_at?: string | null;
  customer_acceptance?: import('@/lib/quotes/quote-acceptance').QuoteCustomerAcceptance | null;
  created_at: string;
  updated_at: string;
};

export type QuoteRequestDbRow = {
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
  draft_quote_snapshot?: PublishedQuoteSnapshot | null;
  published_quote_snapshot?: PublishedQuoteSnapshot | null;
  published_at?: string | null;
  admin_notes?: string | null;
  customer_accepted_at?: string | null;
  customer_acceptance?: import('@/lib/quotes/quote-acceptance').QuoteCustomerAcceptance | null;
  created_at: string;
  updated_at: string;
};

export function mapQuoteRequestRow(row: QuoteRequestDbRow): QuoteRequestRow {
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
    draft_quote_snapshot: row.draft_quote_snapshot ?? null,
    published_quote_snapshot: row.published_quote_snapshot ?? null,
    published_at: row.published_at ?? null,
    admin_notes: row.admin_notes ?? null,
    customer_accepted_at: row.customer_accepted_at ?? null,
    customer_acceptance: row.customer_acceptance ?? null,
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

/** Best display label for a quote request — uses service_type_id, then services/note fallbacks. */
export function resolveQuoteServiceLabel(
  row: Pick<QuoteRequestRow, 'service_type_id' | 'services' | 'note'>,
): string {
  if (row.service_type_id) {
    return serviceTypeLabel(row.service_type_id);
  }

  const noteMatch = row.note?.match(/^Service type:\s*(.+)$/im);
  if (noteMatch?.[1]?.trim()) return noteMatch[1].trim();

  const matchedLabels = (row.services ?? [])
    .map((s) => {
      const id = quoteServiceIdFromLabel(s);
      return id ? serviceTypeLabel(id) : null;
    })
    .filter(Boolean) as string[];
  if (matchedLabels.length) return [...new Set(matchedLabels)].join(', ');

  const fromServices = (row.services ?? [])
    .map((s) => s.trim())
    .filter((s) => s && !/^services?$/i.test(s));
  if (fromServices.length) return fromServices.join(', ');

  return 'Quote request';
}

export function inferQuoteServiceTypeId(
  serviceTypeId: string | null | undefined,
  services: string[] | undefined,
): string | null {
  if (serviceTypeId?.trim()) return serviceTypeId.trim();
  for (const s of services ?? []) {
    const id = quoteServiceIdFromLabel(s);
    if (id) return id;
  }
  return null;
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

export type QuoteRequestInsertInput = {
  userId: string;
  mode?: QuoteRequestMode;
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  services?: string[];
  note?: string | null;
  serviceTypeId?: string | null;
  serviceAnswers?: Record<string, string | boolean> | null;
  vendors?: string[];
  location?: QuoteRequestLocation | null;
};

function isExtendedSchemaError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('column') || m.includes('schema cache');
}

export function buildLegacyQuoteRequestNote(input: QuoteRequestInsertInput): string {
  return input.note?.trim() ?? '';
}

/** Structured field values shown elsewhere in the request details panel. */
export function collectQuoteRequestStructuredValues(row: QuoteRequestRow): {
  pairs: { label: string; value: string }[];
  values: Set<string>;
} {
  const pairs: { label: string; value: string }[] = [];
  const values = new Set<string>();

  const addPair = (label: string, value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    pairs.push({ label, value: trimmed });
    values.add(trimmed.toLowerCase());
  };

  const serviceLabel = resolveQuoteServiceLabel(row);
  addPair('Service type', serviceLabel);
  addPair('Service', serviceLabel);
  addPair('Mode', row.mode === 'add-services' ? 'Add services / users' : 'New quote');

  if (row.location?.city || row.location?.street) {
    const loc = [
      row.location.label,
      row.location.street,
      row.location.city,
      row.location.state,
      row.location.zip,
    ]
      .filter(Boolean)
      .join(', ');
    addPair('Location', loc);
  }

  if (row.vendor_names?.length) {
    addPair('Vendors', row.vendor_names.join(', '));
    for (const v of row.vendor_names) addPair('Vendor', v);
  }

  addPair('Company', row.company);
  addPair('Contact', row.contact_name);
  addPair('Email', row.contact_email);
  addPair('Phone', row.contact_phone);

  for (const answer of formatQuoteRequestAnswers(row)) {
    addPair(answer.label, answer.value);
  }

  return { pairs, values };
}

/** Strip legacy duplicated key:value segments already shown in structured fields (render-only). */
export function sanitizeQuoteRequestNote(
  note: string | null | undefined,
  row: QuoteRequestRow,
): string {
  const raw = note?.trim();
  if (!raw) return '';

  const { pairs: structuredPairs, values: structuredValues } = collectQuoteRequestStructuredValues(row);

  const normalizeLabel = (label: string) => label.trim().toLowerCase().replace(/\?$/, '');

  const isDuplicateSegment = (segment: string): boolean => {
    const trimmed = segment.trim();
    if (!trimmed) return true;

    const lower = trimmed.toLowerCase();
    if (structuredValues.has(lower)) return true;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) return false;

    const label = normalizeLabel(trimmed.slice(0, colonIdx));
    const value = trimmed.slice(colonIdx + 1).trim().toLowerCase();
    if (!label || !value) return false;

    if (structuredValues.has(value)) return true;

    return structuredPairs.some((pair) => {
      const pairLabel = normalizeLabel(pair.label);
      const pairValue = pair.value.toLowerCase();
      if (pairLabel !== label && !pairLabel.includes(label) && !label.includes(pairLabel)) {
        return false;
      }
      return pairValue === value || pairValue.includes(value) || value.includes(pairValue);
    });
  };

  const segments = raw.split(/\n\n|\n|;\s*/).flatMap((block) => {
    if (block.includes('; ') && block.includes(':')) {
      return block.split(/;\s+/).map((s) => s.trim()).filter(Boolean);
    }
    return [block.trim()].filter(Boolean);
  });

  const kept = segments.filter((segment) => !isDuplicateSegment(segment));
  return kept.join('\n\n').trim();
}

/** Free-text paragraphs the customer typed — excludes structured duplicates. */
export function extractCustomerAdditionalNotes(row: QuoteRequestRow): string[] {
  const cleaned = sanitizeQuoteRequestNote(row.note, row);
  if (!isMeaningfulFreeTextNote(cleaned)) return [];

  const { values: structuredValues } = collectQuoteRequestStructuredValues(row);

  return cleaned
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => {
      if (!isMeaningfulFreeTextNote(p)) return false;
      const colonIdx = p.indexOf(':');
      if (colonIdx > 0 && colonIdx < 80 && !p.includes('\n')) {
        const value = p.slice(colonIdx + 1).trim().toLowerCase();
        if (structuredValues.has(value)) return false;
      }
      return true;
    });
}

/** UCaaS instant pricing or merchant Schedule A — skip AI triage panel. */
export function quoteHasBuiltInPricingPath(row: QuoteRequestRow): boolean {
  return row.service_type_id === 'ucaas' || row.service_type_id === 'merchant';
}

export function dedupeQuoteRequirementAnswers(
  row: QuoteRequestRow,
): { label: string; value: string }[] {
  const seenLabels = new Set<string>();
  const seenValues = new Set<string>();
  const vendorLower = new Set((row.vendor_names ?? []).map((v) => v.trim().toLowerCase()));

  return formatQuoteRequestAnswers(row).filter((a) => {
    const labelKey = a.label.trim().toLowerCase();
    const valueKey = a.value.trim().toLowerCase();
    if (!valueKey || seenLabels.has(labelKey)) return false;
    if (seenValues.has(valueKey)) return false;
    // Skip current provider when identical to a vendor already listed under What.
    if (labelKey.includes('current provider') && vendorLower.has(valueKey)) return false;
    seenLabels.add(labelKey);
    seenValues.add(valueKey);
    return true;
  });
}

export function isMeaningfulFreeTextNote(note: string | null | undefined): boolean {
  const trimmed = note?.trim();
  if (!trimmed) return false;
  if (trimmed.length < 2) return false;
  if (/^[a-z]{1,4}$/i.test(trimmed) && !/\s/.test(trimmed)) return false;
  return true;
}

/** Inserts a quote request; falls back to pre-0053 columns when migration is not applied yet. */
export async function insertQuoteRequest(
  admin: SupabaseClient,
  input: QuoteRequestInsertInput,
): Promise<{ id: string | null; error: string | null }> {
  const services = (input.services ?? []).filter(Boolean);
  const vendors = (input.vendors ?? []).filter(Boolean);
  const serviceTypeId = inferQuoteServiceTypeId(input.serviceTypeId, services);
  const subject = buildQuoteRequestSubject({
    mode: input.mode ?? 'request',
    company: input.company,
    serviceTypeId,
    services,
  });

  const { data, error } = await admin
    .from('quote_requests')
    .insert({
      user_id: input.userId,
      mode: input.mode ?? 'request',
      contact_name: input.name ?? null,
      company: input.company ?? null,
      contact_email: input.email ?? null,
      contact_phone: input.phone ?? null,
      services,
      note: input.note ?? null,
      service_type_id: serviceTypeId,
      service_answers: input.serviceAnswers ?? null,
      vendor_names: vendors.length ? vendors : null,
      location: input.location ?? null,
      subject,
      status: 'open',
    })
    .select('id')
    .single();

  if (!error && data?.id) {
    return { id: data.id as string, error: null };
  }

  if (!error || !isExtendedSchemaError(error.message)) {
    return { id: null, error: error?.message ?? 'Insert failed' };
  }

  const legacyNote = buildLegacyQuoteRequestNote(input);
  const legacyServices = [...new Set([...services, ...vendors])];
  const { data: legacy, error: legacyErr } = await admin
    .from('quote_requests')
    .insert({
      user_id: input.userId,
      mode: input.mode ?? 'request',
      contact_name: input.name ?? null,
      company: input.company ?? null,
      contact_email: input.email ?? null,
      contact_phone: input.phone ?? null,
      services: legacyServices,
      note: legacyNote || null,
      status: 'submitted',
    })
    .select('id')
    .single();

  if (legacyErr) {
    return { id: null, error: legacyErr.message };
  }

  console.warn(
    '[quote-request] saved with legacy schema — apply migration 0053 for Action Center columns and admin visibility',
  );
  return { id: (legacy?.id as string) ?? null, error: null };
}

export function formatQuoteRequestDetail(row: QuoteRequestRow): string {
  const parts = [
    resolveQuoteServiceLabel(row),
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
  const res = await fetch('/api/admin/quote-requests');
  if (!res.ok) {
    console.error('fetchQuoteRequestsForAdmin', await res.text());
    return [];
  }
  const data = (await res.json()) as { requests?: QuoteRequestDbRow[] };
  return ((data.requests ?? []) as QuoteRequestDbRow[]).map(mapQuoteRequestRow);
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

export function isQuoteRequestPublished(row: Pick<QuoteRequestRow, 'published_quote_snapshot'>): boolean {
  return Boolean(row.published_quote_snapshot);
}

export function isQuoteRequestPending(row: Pick<QuoteRequestRow, 'published_quote_snapshot' | 'status'>): boolean {
  return !isQuoteRequestPublished(row) && row.status !== 'resolved';
}

export function memberQuoteSeenId(id: string): string {
  return `quote-req-${id}`;
}

export async function fetchMemberQuoteRequests(): Promise<QuoteRequestRow[]> {
  const res = await fetch('/api/portal/quote-requests?scope=all');
  if (!res.ok) {
    console.error('fetchMemberQuoteRequests', await res.text());
    return [];
  }
  const data = (await res.json()) as { requests?: QuoteRequestDbRow[] };
  return ((data.requests ?? []) as QuoteRequestDbRow[]).map(mapQuoteRequestRow);
}

export async function fetchQuoteRequestDetail(id: string): Promise<QuoteRequestRow | null> {
  const res = await fetch(`/api/admin/quote-requests/${id}`);
  if (!res.ok) {
    console.error('fetchQuoteRequestDetail', await res.text());
    return null;
  }
  const data = (await res.json()) as { request?: QuoteRequestDbRow };
  return data.request ? mapQuoteRequestRow(data.request) : null;
}

export type PatchQuoteRequestInput = {
  status?: 'open' | 'in_progress' | 'resolved';
  replyMessage?: string;
  notifyMember?: boolean;
  adminNotes?: string;
  draftQuoteSnapshot?: PublishedQuoteSnapshot | null;
  publish?: boolean;
};

export async function patchQuoteRequest(id: string, input: PatchQuoteRequestInput): Promise<QuoteRequestRow | null> {
  const res = await fetch(`/api/admin/quote-requests/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    console.error('patchQuoteRequest', await res.text());
    return null;
  }
  const data = (await res.json()) as { request?: QuoteRequestDbRow };
  return data.request ? mapQuoteRequestRow(data.request) : null;
}

export async function fetchPublishedQuoteRequestsForMember(): Promise<QuoteRequestRow[]> {
  const res = await fetch('/api/portal/quote-requests');
  if (!res.ok) return [];
  const data = (await res.json()) as { requests?: QuoteRequestDbRow[] };
  return ((data.requests ?? []) as QuoteRequestDbRow[]).map(mapQuoteRequestRow);
}
