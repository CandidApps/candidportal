import type { AnalysisTicketRow } from '@/lib/services/analysis-tickets';
import type { BillAnalysisReviewRow } from '@/lib/bill-parse-types';
import type { CustomerTicketRow } from '@/lib/services/customer-tickets';
import { formatCustomerTicketTime } from '@/lib/services/customer-tickets';
import { formatTicketTime } from '@/lib/services/analysis-tickets';
import type { MemberReviewRequestRow } from '@/lib/services/member-review-requests';
import { formatReviewRequestTime } from '@/lib/services/member-review-requests';
import type { QuoteRequestRow } from '@/lib/services/quote-requests';
import {
  formatQuoteRequestDetail,
  formatQuoteRequestTime,
  normalizeQuoteRequestStatus,
} from '@/lib/services/quote-requests';
import type { CustomerMessageThreadRow } from '@/lib/services/customer-message-threads';
import { customerMessageThreadPreview, formatCustomerMessageThreadTime } from '@/lib/services/customer-message-threads';
import { formatReviewTime } from '@/lib/services/analysis-reviews';
import { DEMO_STATEMENT_REVIEWS, type DemoStatementReview } from '@/lib/demo/admin-portfolio';

import type { Customer } from '@/components/CustomersView';

export type AdminTicketKind =
  | 'service'
  | 'analysis'
  | 'statement'
  | 'renewal'
  | 'optimization'
  | 'analysis_review'
  | 'review_request'
  | 'quote_request'
  | 'customer_message';
export type AdminTicketStatus = 'open' | 'in_progress' | 'resolved';

export type UnifiedAdminTicket = {
  id: string;
  kind: AdminTicketKind;
  status: AdminTicketStatus;
  title: string;
  detail: string;
  customerName: string;
  customerEmail: string;
  createdAt: string;
  /** Last update on the underlying source row (status change, edit, etc.). */
  updatedAt?: string;
  /** Latest interaction across the source row and team action work. */
  lastModifiedAt?: string;
  timeLabel: string;
  sourceId: string;
  actionKey?: string;
  assignees?: import('@/lib/admin-action-work').ActionAssignee[];
  assigneeIds?: string[];
  assigneeNames?: string[];
  /** Assignees who have claimed (actively working) — rendered green. */
  claimerIds?: string[];
  claimerNames?: string[];
};

const dismissedStatements = new Set<string>();

export function dismissDemoStatementReview(id: string) {
  dismissedStatements.add(id);
}

function mapCustomerTicket(t: CustomerTicketRow): UnifiedAdminTicket {
  return {
    id: `svc-${t.id}`,
    kind: 'service',
    status: t.status === 'resolved' ? 'resolved' : t.status,
    title: t.subject,
    detail: `${t.service_name} — ${t.message}`,
    customerName: t.customer_name || 'Customer',
    customerEmail: t.customer_email,
    createdAt: t.created_at,
    updatedAt: t.updated_at ?? t.created_at,
    timeLabel: formatCustomerTicketTime(t.created_at),
    sourceId: t.id,
  };
}

function mapAnalysisTicket(t: AnalysisTicketRow): UnifiedAdminTicket {
  return {
    id: `analysis-${t.id}`,
    kind: 'analysis',
    status: t.status === 'resolved' ? 'resolved' : 'open',
    title: 'Analysis question',
    detail: `${t.merchant_name || 'Merchant processing'}: ${t.question}`,
    customerName: t.customer_name || t.customer_email || 'Customer',
    customerEmail: t.customer_email ?? '',
    createdAt: t.created_at,
    updatedAt: t.updated_at ?? t.created_at,
    timeLabel: formatTicketTime(t.created_at),
    sourceId: t.id,
  };
}

function mapAnalysisReview(r: BillAnalysisReviewRow): UnifiedAdminTicket {
  return {
    id: `review-${r.id}`,
    kind: 'analysis_review',
    status:
      r.status === 'published' || r.status === 'dismissed'
        ? 'resolved'
        : r.status === 'in_progress'
          ? 'in_progress'
          : 'open',
    title: 'Bill analysis review',
    detail: `${r.vendor_name} — ${r.category_label ?? r.detected_category}`,
    customerName: r.customer_name || 'Customer',
    customerEmail: r.customer_email ?? '',
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? r.created_at,
    timeLabel: formatReviewTime(r.created_at),
    sourceId: r.id,
  };
}

function mapReviewRequest(r: MemberReviewRequestRow): UnifiedAdminTicket {
  return {
    id: `review-req-${r.id}`,
    kind: 'review_request',
    status: r.status === 'resolved' ? 'resolved' : r.status,
    title: r.subject,
    detail: [r.message, r.vendor_name ? `Vendor: ${r.vendor_name}` : null, r.service_name]
      .filter(Boolean)
      .join(' — '),
    customerName: r.customer_name || 'Customer',
    customerEmail: r.customer_email ?? '',
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? r.created_at,
    timeLabel: formatReviewRequestTime(r.created_at),
    sourceId: r.id,
  };
}

function mapQuoteRequest(r: QuoteRequestRow): UnifiedAdminTicket {
  const status = normalizeQuoteRequestStatus(r.status);
  const legacyTitle =
    r.company && r.services[0]
      ? `Quote request — ${r.services[0]} (${r.company})`
      : r.company
        ? `Quote request — ${r.company}`
        : 'Quote request';
  return {
    id: `quote-req-${r.id}`,
    kind: 'quote_request',
    status,
    title: r.subject ?? legacyTitle,
    detail: formatQuoteRequestDetail(r),
    customerName: r.company || r.contact_name || 'Customer',
    customerEmail: r.contact_email ?? '',
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? r.created_at,
    timeLabel: formatQuoteRequestTime(r.created_at),
    sourceId: r.id,
  };
}

function mapCustomerMessageThread(t: CustomerMessageThreadRow): UnifiedAdminTicket {
  const status =
    t.status === 'closed' || t.status === 'resolved' ? 'resolved' : ('open' as AdminTicketStatus);
  return {
    id: `cust-msg-${t.id}`,
    kind: 'customer_message',
    status,
    title: t.subject?.trim() || 'Customer message',
    detail: customerMessageThreadPreview(t),
    customerName: t.customer_name || 'Customer',
    customerEmail: t.customer_email ?? '',
    createdAt: t.created_at ?? t.updated_at,
    updatedAt: t.updated_at,
    timeLabel: formatCustomerMessageThreadTime(t.updated_at),
    sourceId: t.id,
  };
}

function mapStatementReview(s: DemoStatementReview): UnifiedAdminTicket {
  return {
    id: `statement-${s.id}`,
    kind: 'statement',
    status: s.status,
    title: 'Statement uploaded for review',
    detail: `${s.merchantName} — ${s.fileName}`,
    customerName: s.customerName,
    customerEmail: s.customerEmail,
    createdAt: s.createdAt,
    updatedAt: s.createdAt,
    timeLabel: formatCustomerTicketTime(s.createdAt),
    sourceId: s.id,
  };
}

export function buildPortalActionTickets(customers: Customer[]): UnifiedAdminTicket[] {
  const tickets: UnifiedAdminTicket[] = [];

  for (const customer of customers) {
    const email =
      customer.contacts.find((c) => c.isPrimary)?.email ??
      customer.contacts[0]?.email ??
      '';

    for (const action of customer.portal?.actions ?? []) {
      const dueSuffix = action.dueDate ? ` · Due ${action.dueDate}` : '';
      tickets.push({
        id: `portal-${action.id}`,
        kind: action.kind === 'renewal' ? 'renewal' : 'optimization',
        status: 'open',
        title: action.title,
        detail: `${action.detail} Suggested: ${action.suggestedAction}${dueSuffix}`,
        customerName: customer.company,
        customerEmail: email,
        createdAt: action.createdAt ?? '',
        updatedAt: action.createdAt ?? '',
        timeLabel: action.createdAt ? formatCustomerTicketTime(action.createdAt) : action.dueDate ? `Due ${action.dueDate}` : '—',
        sourceId: action.id,
      });
    }
  }

  return tickets.sort((a, b) => {
    const aRenewal = a.kind === 'renewal' ? 0 : 1;
    const bRenewal = b.kind === 'renewal' ? 0 : 1;
    if (aRenewal !== bRenewal) return aRenewal - bRenewal;
    const aTime = ticketCreatedTimestamp(a.createdAt);
    const bTime = ticketCreatedTimestamp(b.createdAt);
    return aTime - bTime;
  });
}

export function ticketCreatedTimestamp(iso: string): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Display value for the Action Center "Created" column. */
export function formatAdminTicketCreated(createdAt: string, timeLabel?: string): string {
  if (!createdAt) return '—';
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function buildUnifiedAdminTickets(
  customerTickets: CustomerTicketRow[],
  analysisTickets: AnalysisTicketRow[],
  includeResolved = false,
  portalCustomers: Customer[] = [],
  analysisReviews: BillAnalysisReviewRow[] = [],
  reviewRequests: MemberReviewRequestRow[] = [],
  quoteRequests: QuoteRequestRow[] = [],
  customerMessageThreads: CustomerMessageThreadRow[] = [],
): UnifiedAdminTicket[] {
  const statements = DEMO_STATEMENT_REVIEWS.filter((s) => !dismissedStatements.has(s.id)).map(mapStatementReview);

  const items: UnifiedAdminTicket[] = [
    ...buildPortalActionTickets(portalCustomers),
    ...analysisReviews.map(mapAnalysisReview),
    ...reviewRequests.map(mapReviewRequest),
    ...quoteRequests.map(mapQuoteRequest),
    ...customerMessageThreads.map(mapCustomerMessageThread),
    ...statements,
    ...customerTickets.map(mapCustomerTicket),
    ...analysisTickets.map(mapAnalysisTicket),
  ];

  const filtered = includeResolved
    ? items
    : items.filter((t) => t.status !== 'resolved');

  return filtered.sort(
    (a, b) => ticketCreatedTimestamp(b.createdAt) - ticketCreatedTimestamp(a.createdAt),
  );
}

export const TICKET_KIND_LABEL: Record<AdminTicketKind, string> = {
  service: 'Service ticket',
  analysis: 'Analysis',
  statement: 'Statement review',
  renewal: 'Contract renewal',
  optimization: 'Savings opportunity',
  analysis_review: 'Analysis review',
  review_request: 'Review request',
  quote_request: 'Quote request',
  customer_message: 'Customer message',
};
