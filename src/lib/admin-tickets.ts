import type { AnalysisTicketRow } from '@/lib/services/analysis-tickets';
import type { CustomerTicketRow } from '@/lib/services/customer-tickets';
import { formatCustomerTicketTime } from '@/lib/services/customer-tickets';
import { formatTicketTime } from '@/lib/services/analysis-tickets';
import { DEMO_STATEMENT_REVIEWS, type DemoStatementReview } from '@/lib/demo/admin-portfolio';

import type { Customer } from '@/components/CustomersView';

export type AdminTicketKind = 'service' | 'analysis' | 'statement' | 'renewal' | 'optimization';
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
  timeLabel: string;
  sourceId: string;
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
    timeLabel: formatTicketTime(t.created_at),
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
      tickets.push({
        id: `portal-${action.id}`,
        kind: action.kind === 'renewal' ? 'renewal' : 'optimization',
        status: 'open',
        title: action.title,
        detail: `${action.detail} Suggested: ${action.suggestedAction}`,
        customerName: customer.company,
        customerEmail: email,
        createdAt: action.dueDate ?? '2026-01-01',
        timeLabel: action.dueDate ? `Due ${action.dueDate}` : 'Review',
        sourceId: action.id,
      });
    }
  }

  return tickets.sort((a, b) => {
    const aRenewal = a.kind === 'renewal' ? 0 : 1;
    const bRenewal = b.kind === 'renewal' ? 0 : 1;
    if (aRenewal !== bRenewal) return aRenewal - bRenewal;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export function buildUnifiedAdminTickets(
  customerTickets: CustomerTicketRow[],
  analysisTickets: AnalysisTicketRow[],
  includeResolved = false,
  portalCustomers: Customer[] = [],
): UnifiedAdminTicket[] {
  const statements = DEMO_STATEMENT_REVIEWS.filter((s) => !dismissedStatements.has(s.id)).map(mapStatementReview);

  const items: UnifiedAdminTicket[] = [
    ...buildPortalActionTickets(portalCustomers),
    ...statements,
    ...customerTickets.map(mapCustomerTicket),
    ...analysisTickets.map(mapAnalysisTicket),
  ];

  const filtered = includeResolved
    ? items
    : items.filter((t) => t.status !== 'resolved');

  return filtered.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export const TICKET_KIND_LABEL: Record<AdminTicketKind, string> = {
  service: 'Service ticket',
  analysis: 'Analysis',
  statement: 'Statement review',
  renewal: 'Contract renewal',
  optimization: 'Savings opportunity',
};
