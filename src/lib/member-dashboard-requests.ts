import type { ServiceCardModel } from '@/lib/services/account-services';
import type { CustomerTicketRow } from '@/lib/services/customer-tickets';
import type { MemberServiceRequestRow } from '@/lib/services/member-service-requests';
import { serviceRequestCategoryMeta } from '@/lib/service-request-config';
import type { MemberReviewRequestRow } from '@/lib/services/member-review-requests';
import {
  isQuoteRequestPending,
  isQuoteRequestPublished,
  resolveQuoteServiceLabel,
  type QuoteRequestRow,
} from '@/lib/services/quote-requests';
import {
  formatMemberSlaDueLabel,
  memberSlaStatus,
  memberSlaSummaryCopy,
  type MemberSlaStatus,
} from '@/lib/member-request-sla';

export type MemberDashboardRequestKind =
  | 'quote_request'
  | 'bill_analysis'
  | 'service_ticket'
  | 'review_request'
  | 'help_request';

export type MemberDashboardRequestTarget =
  | { view: 'msavings' }
  | { view: 'msavings'; publishedQuoteId: string }
  | { view: 'mservices' }
  | { view: 'mmessages' };

export type MemberDashboardRequestStatus = 'submitted' | 'in_progress' | 'ready';

export type MemberDashboardRequest = {
  id: string;
  kind: MemberDashboardRequestKind;
  title: string;
  detail: string;
  status: MemberDashboardRequestStatus;
  createdAt: string;
  slaLabel: string | null;
  slaStatus: MemberSlaStatus | null;
  target: MemberDashboardRequestTarget;
};

function slaFields(createdAt: string | null | undefined): {
  slaLabel: string | null;
  slaStatus: MemberSlaStatus | null;
} {
  if (!createdAt) {
    return { slaLabel: memberSlaSummaryCopy(), slaStatus: 'ok' };
  }
  return {
    slaLabel: formatMemberSlaDueLabel(createdAt),
    slaStatus: memberSlaStatus(createdAt),
  };
}

export function buildMemberDashboardRequests(input: {
  quoteRequests: QuoteRequestRow[];
  pendingBills: ServiceCardModel[];
  readyBills: ServiceCardModel[];
  openTickets: CustomerTicketRow[];
  reviewRequests: MemberReviewRequestRow[];
  serviceRequests?: MemberServiceRequestRow[];
}): MemberDashboardRequest[] {
  const items: MemberDashboardRequest[] = [];

  for (const q of input.quoteRequests) {
    const published = isQuoteRequestPublished(q);
    const pending = isQuoteRequestPending(q);
    if (!published && !pending && q.status !== 'in_progress') continue;

    const status: MemberDashboardRequestStatus = published
      ? 'ready'
      : q.status === 'in_progress'
        ? 'in_progress'
        : 'submitted';

    const sla = published ? { slaLabel: null, slaStatus: null } : slaFields(q.created_at);

    items.push({
      id: `quote-${q.id}`,
      kind: 'quote_request',
      title: q.subject ?? resolveQuoteServiceLabel(q),
      detail: published ? 'Your quote is ready to review' : 'Quote request — Candid is preparing your options',
      status,
      createdAt: q.created_at,
      ...sla,
      target: published ? { view: 'msavings', publishedQuoteId: q.id } : { view: 'msavings' },
    });
  }

  for (const s of input.readyBills) {
    items.push({
      id: `ready-bill-${s.id}`,
      kind: 'bill_analysis',
      title: s.vendor || s.name,
      detail: 'Savings analysis ready to review',
      status: 'ready',
      createdAt: new Date().toISOString(),
      slaLabel: null,
      slaStatus: null,
      target: { view: 'msavings' },
    });
  }

  for (const s of input.pendingBills) {
    const sla = slaFields(null);
    items.push({
      id: `bill-${s.id}`,
      kind: 'bill_analysis',
      title: s.vendor || s.name,
      detail: 'Bill submitted — analysis in progress',
      status: 'submitted',
      createdAt: new Date().toISOString(),
      ...sla,
      target: { view: 'msavings' },
    });
  }

  for (const t of input.openTickets) {
    const sla = slaFields(t.created_at);
    items.push({
      id: `ticket-${t.id}`,
      kind: 'service_ticket',
      title: t.subject,
      detail: `${t.service_name} · ${t.status === 'in_progress' ? 'In progress' : 'Submitted'}`,
      status: t.status === 'in_progress' ? 'in_progress' : 'submitted',
      createdAt: t.created_at,
      ...sla,
      target: { view: 'mservices' },
    });
  }

  for (const r of input.reviewRequests) {
    if (r.status === 'resolved') continue;
    const sla = slaFields(r.created_at);
    items.push({
      id: `review-${r.id}`,
      kind: 'review_request',
      title: r.subject,
      detail: `${r.service_name}${r.status === 'in_progress' ? ' · In progress' : ' · Submitted'}`,
      status: r.status === 'in_progress' ? 'in_progress' : 'submitted',
      createdAt: r.created_at,
      ...sla,
      target: { view: 'mservices' },
    });
  }

  for (const s of input.serviceRequests ?? []) {
    if (s.status !== 'resolved_self_service') continue;
    const cat = serviceRequestCategoryMeta(s.category);
    items.push({
      id: `help-${s.id}`,
      kind: 'help_request',
      title: s.subject,
      detail: `${cat.label} · Resolved with self-service guide`,
      status: 'ready',
      createdAt: s.created_at,
      slaLabel: null,
      slaStatus: null,
      target: { view: 'mservices' },
    });
  }

  return items.sort((a, b) => {
    const statusOrder = { ready: 0, in_progress: 1, submitted: 2 };
    const byStatus = statusOrder[a.status] - statusOrder[b.status];
    if (byStatus !== 0) return byStatus;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export const MEMBER_REQUEST_KIND_LABEL: Record<MemberDashboardRequestKind, string> = {
  quote_request: 'Quote',
  bill_analysis: 'Bill analysis',
  service_ticket: 'Support ticket',
  review_request: 'Review request',
  help_request: 'Get help',
};
