'use client';

import type { AdminTicketKind } from '@/lib/admin-tickets';
import { TICKET_KIND_LABEL } from '@/lib/admin-tickets';
import type { Customer } from '@/components/CustomersView';
import type { CustomerPortalData } from '@/lib/portal-import/merge';
import type { AnalysisTicketRow } from '@/lib/services/analysis-tickets';
import type { CustomerTicketRow } from '@/lib/services/customer-tickets';
import type { UnifiedAdminTicket } from '@/lib/admin-tickets';
import { AdminTicketsView } from '@/components/admin/AdminTicketsView';
import { AnalysisReviewDetailPanel } from '@/components/admin/AnalysisReviewDetailPanel';
import { QuoteRequestDetailPanel } from '@/components/admin/QuoteRequestDetailPanel';

export type ActionCenterTab = 'mine' | 'all' | AdminTicketKind;

export const ACTION_CENTER_TABS: { id: ActionCenterTab; label: string }[] = [
  { id: 'mine', label: 'My actions' },
  { id: 'all', label: 'All actions' },
  { id: 'review_request', label: TICKET_KIND_LABEL.review_request },
  { id: 'quote_request', label: TICKET_KIND_LABEL.quote_request },
  { id: 'analysis_review', label: TICKET_KIND_LABEL.analysis_review },
  { id: 'statement', label: TICKET_KIND_LABEL.statement },
  { id: 'service', label: TICKET_KIND_LABEL.service },
  { id: 'analysis', label: TICKET_KIND_LABEL.analysis },
  { id: 'renewal', label: TICKET_KIND_LABEL.renewal },
  { id: 'optimization', label: TICKET_KIND_LABEL.optimization },
];

export function AdminActionCenterView({
  tab,
  onTabChange,
  tickets,
  customerTickets,
  analysisTickets,
  portalCustomers,
  selectedAnalysisReviewId,
  onSelectAnalysisReview,
  onClearAnalysisReview,
  selectedQuoteRequestId,
  onSelectQuoteRequest,
  onClearQuoteRequest,
  onResolveServiceTicket,
  onResolveAnalysisTicket,
  onDismissStatementReview,
  onSetServiceInProgress,
  onAnalysisPublished,
  onQuoteUpdated,
  customers = [],
  onOpenCustomer,
  initialSelectedTicketId,
  currentUserId,
  onActionWorkUpdated,
  reviewRequests = [],
  onResolveReviewRequest,
  onSetReviewInProgress,
  onReplyReviewRequest,
  quoteRequests = [],
  onResolveQuoteRequest,
  onSetQuoteInProgress,
  onReplyServiceTicket,
  onTicketDetailClose,
  onOpenCustomerMessage,
}: {
  tab: ActionCenterTab;
  onTabChange: (tab: ActionCenterTab) => void;
  tickets: UnifiedAdminTicket[];
  customerTickets: CustomerTicketRow[];
  analysisTickets: AnalysisTicketRow[];
  portalCustomers: { company: string; portal?: CustomerPortalData }[];
  selectedAnalysisReviewId: string | null;
  onSelectAnalysisReview: (id: string | null) => void;
  onClearAnalysisReview: () => void;
  selectedQuoteRequestId?: string | null;
  onSelectQuoteRequest?: (id: string | null) => void;
  onClearQuoteRequest?: () => void;
  onResolveServiceTicket?: (ticketId: string) => void;
  onResolveAnalysisTicket?: (ticketId: string) => void;
  onDismissStatementReview?: (sourceId: string) => void;
  onSetServiceInProgress?: (ticketId: string) => void;
  onAnalysisPublished?: () => void;
  onQuoteUpdated?: () => void;
  customers?: Customer[];
  onOpenCustomer?: (customerId: string) => void;
  initialSelectedTicketId?: string | null;
  currentUserId?: string;
  onActionWorkUpdated?: () => void;
  reviewRequests?: import('@/lib/services/member-review-requests').MemberReviewRequestRow[];
  quoteRequests?: import('@/lib/services/quote-requests').QuoteRequestRow[];
  onResolveReviewRequest?: (requestId: string) => void;
  onSetReviewInProgress?: (requestId: string) => void;
  onReplyReviewRequest?: (requestId: string, message: string) => Promise<boolean>;
  onResolveQuoteRequest?: (requestId: string) => void;
  onSetQuoteInProgress?: (requestId: string) => void;
  onReplyServiceTicket?: (ticketId: string, message: string) => Promise<boolean>;
  onTicketDetailClose?: () => void;
  onOpenCustomerMessage?: (threadId: string) => void;
}) {
  if (selectedAnalysisReviewId) {
    const reviewTicket = tickets.find(
      (t) => t.kind === 'analysis_review' && t.sourceId === selectedAnalysisReviewId,
    );
    return (
      <AnalysisReviewDetailPanel
        reviewId={selectedAnalysisReviewId}
        onClose={onClearAnalysisReview}
        onPublished={onAnalysisPublished}
        customers={customers}
        onOpenCustomer={onOpenCustomer}
        currentUserId={currentUserId}
        onActionWorkUpdated={onActionWorkUpdated}
        assignees={reviewTicket?.assignees}
      />
    );
  }

  if (selectedQuoteRequestId) {
    const quoteTicket = tickets.find(
      (t) => t.kind === 'quote_request' && t.sourceId === selectedQuoteRequestId,
    );
    return (
      <QuoteRequestDetailPanel
        quoteRequestId={selectedQuoteRequestId}
        onClose={() => onClearQuoteRequest?.()}
        onUpdated={onQuoteUpdated}
        currentUserId={currentUserId}
        onActionWorkUpdated={onActionWorkUpdated}
        assignees={quoteTicket?.assignees}
      />
    );
  }

  return (
    <div>
      <AdminTicketsView
        embedMode
        tickets={tickets}
        customerTickets={customerTickets}
        analysisTickets={analysisTickets}
        portalCustomers={portalCustomers}
        tab={tab}
        onTabChange={onTabChange}
        currentUserId={currentUserId}
        onActionWorkUpdated={onActionWorkUpdated}
        reviewRequests={reviewRequests}
        onResolveReviewRequest={onResolveReviewRequest}
        onSetReviewInProgress={onSetReviewInProgress}
        onReplyReviewRequest={onReplyReviewRequest}
        quoteRequests={quoteRequests}
        onResolveQuoteRequest={onResolveQuoteRequest}
        onSetQuoteInProgress={onSetQuoteInProgress}
        onResolveServiceTicket={onResolveServiceTicket}
        onResolveAnalysisTicket={onResolveAnalysisTicket}
        onDismissStatementReview={onDismissStatementReview}
        onSetServiceInProgress={onSetServiceInProgress}
        onReplyServiceTicket={onReplyServiceTicket}
        onOpenAnalysisReview={(id) => onSelectAnalysisReview(id)}
        onOpenQuoteRequest={(id) => onSelectQuoteRequest?.(id)}
        onOpenCustomerMessage={onOpenCustomerMessage}
        initialSelectedTicketId={initialSelectedTicketId}
        onDetailClose={onTicketDetailClose}
      />
    </div>
  );
}
