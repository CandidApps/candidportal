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
import type { MemberServiceRequestRow } from '@/lib/services/member-service-requests';
import { formatMemberServiceRequestTime } from '@/lib/services/member-service-requests';
import { serviceRequestCategoryMeta, type ServiceRequestCategory } from '@/lib/service-request-config';
import { DEMO_STATEMENT_REVIEWS, type DemoStatementReview } from '@/lib/demo/admin-portfolio';

import type { ContractSubmitActionRow } from '@/lib/services/contract-submit-actions';
import {
  CONTRACT_DEAL_STAGE_LABEL,
  dealAccountDisplayName,
  dealContactDisplayName,
  formatContractSubmitTime,
  isCustomerSubmitStage,
  isSupplierSubmitStage,
  ticketStatusForDealStage,
} from '@/lib/services/contract-submit-actions';
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
  | 'customer_message'
  | 'service_request'
  | 'submit_contract'
  | 'submit_contract_to_customer'
  | 'outreach';
export type AdminTicketStatus = 'open' | 'in_progress' | 'resolved';

export type UnifiedAdminTicket = {
  id: string;
  kind: AdminTicketKind;
  status: AdminTicketStatus;
  /** Optional display label for Status column (e.g. deal pipeline stage). */
  statusLabel?: string;
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

/** Bill-analysis acknowledgment threads duplicate the real Action Center item (`analysis_review`). */
export function isBillAnalysisMessageThread(
  t: Pick<CustomerMessageThreadRow, 'category' | 'analysis_review_id'>,
): boolean {
  return t.category === 'bill_analysis' || Boolean(t.analysis_review_id);
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

function mapMemberServiceRequest(r: MemberServiceRequestRow): UnifiedAdminTicket {
  const catLabel = serviceRequestCategoryMeta(r.category as ServiceRequestCategory).label;
  return {
    id: `svc-req-${r.id}`,
    kind: 'service_request',
    status: r.status === 'resolved_self_service' ? 'resolved' : r.status === 'resolved' ? 'resolved' : 'open',
    title: r.subject,
    detail: [
      catLabel,
      r.outcome === 'self_service' ? 'Resolved with self-service guide' : 'Escalated to team',
      r.guide_title ? `Guide: ${r.guide_title}` : null,
      r.message,
    ]
      .filter(Boolean)
      .join(' — '),
    customerName: r.customer_name || 'Customer',
    customerEmail: r.customer_email ?? '',
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? r.created_at,
    timeLabel: formatMemberServiceRequestTime(r.created_at),
    sourceId: r.id,
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

function mapContractSubmitAction(r: ContractSubmitActionRow): UnifiedAdminTicket | null {
  const account = dealAccountDisplayName(r);
  const contact = dealContactDisplayName(r);
  const customerName = contact ? `${account} · ${contact}` : account;
  /** Stable across supplier → customer stages so Action Center selection survives pipeline advances. */
  const stableId = `submit-contract-${r.id}`;

  if (r.status === 'converted') {
    return {
      id: stableId,
      kind: 'submit_contract',
      status: 'resolved',
      statusLabel: CONTRACT_DEAL_STAGE_LABEL[r.status],
      title: 'Accepted quote — converted',
      detail: `${r.service_label} · ${CONTRACT_DEAL_STAGE_LABEL[r.status]}`,
      customerName,
      customerEmail: r.customer_email ?? '',
      createdAt: r.created_at,
      updatedAt: r.updated_at ?? r.created_at,
      timeLabel: formatContractSubmitTime(r.updated_at ?? r.created_at),
      sourceId: r.id,
    };
  }

  const detailParts = [
    r.vendor_name || r.service_label,
    CONTRACT_DEAL_STAGE_LABEL[r.status],
    r.pay_source ? `Pay source: ${r.pay_source}` : null,
    r.acceptance?.monthlyTotal != null
      ? `Monthly ~$${r.acceptance.monthlyTotal.toFixed(2)}`
      : null,
  ].filter(Boolean);

  if (isCustomerSubmitStage(r.status)) {
    return {
      id: stableId,
      kind: 'submit_contract_to_customer',
      status: ticketStatusForDealStage(r.status),
      statusLabel: CONTRACT_DEAL_STAGE_LABEL[r.status],
      title: 'Submit contract to customer',
      detail: detailParts.join(' — '),
      customerName,
      customerEmail: r.customer_email ?? '',
      createdAt: r.created_at,
      updatedAt: r.updated_at ?? r.created_at,
      timeLabel: formatContractSubmitTime(r.updated_at ?? r.created_at),
      sourceId: r.id,
    };
  }

  if (isSupplierSubmitStage(r.status)) {
    return {
      id: stableId,
      kind: 'submit_contract',
      status: ticketStatusForDealStage(r.status),
      statusLabel: CONTRACT_DEAL_STAGE_LABEL[r.status],
      title: 'Accepted quote — submit contract',
      detail: detailParts.join(' — '),
      customerName,
      customerEmail: r.customer_email ?? '',
      createdAt: r.created_at,
      updatedAt: r.updated_at ?? r.created_at,
      timeLabel: formatContractSubmitTime(r.updated_at ?? r.created_at),
      sourceId: r.id,
    };
  }

  return null;
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
  memberServiceRequests: MemberServiceRequestRow[] = [],
  contractSubmitActions: ContractSubmitActionRow[] = [],
): UnifiedAdminTicket[] {
  const statements = DEMO_STATEMENT_REVIEWS.filter((s) => !dismissedStatements.has(s.id)).map(mapStatementReview);

  const memberServiceTickets = memberServiceRequests
    .filter(
      (r) =>
        r.outcome === 'self_service' ||
        (r.outcome === 'escalated_ticket' && !r.linked_ticket_id),
    )
    .map(mapMemberServiceRequest);

  const items: UnifiedAdminTicket[] = [
    ...buildPortalActionTickets(portalCustomers),
    ...analysisReviews.map(mapAnalysisReview),
    ...reviewRequests.map(mapReviewRequest),
    ...quoteRequests.map(mapQuoteRequest),
    ...contractSubmitActions.map(mapContractSubmitAction).filter((t): t is UnifiedAdminTicket => Boolean(t)),
    ...customerMessageThreads.filter((t) => !isBillAnalysisMessageThread(t)).map(mapCustomerMessageThread),
    ...memberServiceTickets,
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

export type OutreachTicketMeta = {
  id: string;
  company: string;
  customerExternalId: string;
  contactEmail?: string;
  statusLabel?: string;
  nextFollowUpAt?: string | null;
};

/**
 * Build Action Center tickets from outreach rows that have been claimed or assigned
 * via admin_action_work. Only rows with at least one assignee become tickets.
 */
export function buildOutreachTicketsFromActionWork(
  workByKey: Record<string, import('@/lib/admin-action-work').ActionWorkState>,
  outreachById: Map<string, OutreachTicketMeta>,
): UnifiedAdminTicket[] {
  const tickets: UnifiedAdminTicket[] = [];
  for (const work of Object.values(workByKey)) {
    if (work.actionKind !== 'outreach') continue;
    if (!work.assigneeIds?.length) continue;
    const meta = outreachById.get(work.sourceId);
    const claimed = (work.claimerIds?.length ?? 0) > 0;
    const createdAt = work.lastActivityAt ?? new Date().toISOString();
    const followUp =
      meta?.nextFollowUpAt && meta.nextFollowUpAt.trim()
        ? `Follow-up ${meta.nextFollowUpAt}`
        : meta?.statusLabel || 'Outreach follow-up';
    tickets.push({
      id: `outreach-${work.sourceId}`,
      kind: 'outreach',
      status: claimed ? 'in_progress' : 'open',
      title: meta ? `Outreach · ${meta.company}` : 'Outreach account',
      detail: followUp,
      customerName: meta?.company ?? 'Account',
      customerEmail: meta?.contactEmail ?? '',
      createdAt,
      updatedAt: createdAt,
      lastModifiedAt: createdAt,
      timeLabel: formatCustomerTicketTime(createdAt),
      sourceId: work.sourceId,
      actionKey: work.actionKey,
      assignees: work.assignees,
      assigneeIds: work.assigneeIds,
      assigneeNames: work.assigneeNames,
      claimerIds: work.claimerIds,
      claimerNames: work.claimerNames,
    });
  }
  return tickets;
}

export const TICKET_KIND_LABEL: Record<AdminTicketKind, string> = {
  service: 'Service ticket',
  analysis: 'Analysis',
  statement: 'Statement review',
  renewal: 'Contract renewal',
  optimization: 'AI recommendation',
  analysis_review: 'Analysis review',
  review_request: 'Review request',
  quote_request: 'Quote request',
  customer_message: 'Customer message',
  service_request: 'Service request',
  submit_contract: 'Submit contract',
  submit_contract_to_customer: 'Submit to customer',
  outreach: 'Outreach',
};
