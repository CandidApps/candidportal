'use client';

import type { AdminTicketKind } from '@/lib/admin-tickets';
import { TICKET_KIND_LABEL } from '@/lib/admin-tickets';
import type { Customer } from '@/components/CustomersView';
import type { CustomerPortalData } from '@/lib/portal-import/merge';
import type { AnalysisTicketRow } from '@/lib/services/analysis-tickets';
import type { CustomerTicketRow } from '@/lib/services/customer-tickets';
import type { UnifiedAdminTicket } from '@/lib/admin-tickets';
import { AdminTicketsView } from '@/components/admin/AdminTicketsView';
import { AdminAnalysisReviewView } from '@/components/admin/AdminAnalysisReviewView';
import { AnalysisReviewDetailPanel } from '@/components/admin/AnalysisReviewDetailPanel';

export type ActionCenterTab = 'all' | AdminTicketKind;

export const ACTION_CENTER_TABS: { id: ActionCenterTab; label: string }[] = [
  { id: 'all', label: 'All actions' },
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
  onResolveServiceTicket,
  onResolveAnalysisTicket,
  onDismissStatementReview,
  onSetServiceInProgress,
  onAnalysisPublished,
  customers = [],
  onOpenCustomer,
  initialSelectedTicketId,
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
  onResolveServiceTicket?: (ticketId: string) => void;
  onResolveAnalysisTicket?: (ticketId: string) => void;
  onDismissStatementReview?: (sourceId: string) => void;
  onSetServiceInProgress?: (ticketId: string) => void;
  onAnalysisPublished?: () => void;
  customers?: Customer[];
  onOpenCustomer?: (customerId: string) => void;
  initialSelectedTicketId?: string | null;
}) {
  if (selectedAnalysisReviewId) {
    return (
      <AnalysisReviewDetailPanel
        reviewId={selectedAnalysisReviewId}
        onClose={onClearAnalysisReview}
        onPublished={onAnalysisPublished}
        customers={customers}
        onOpenCustomer={onOpenCustomer}
      />
    );
  }

  return (
    <div>
      <div className="action-center-type-tabs" role="tablist" aria-label="Action Center types">
        {ACTION_CENTER_TABS.map((item) => {
          const count =
            item.id === 'all'
              ? tickets.filter((t) => t.status !== 'resolved').length
              : tickets.filter((t) => t.kind === item.id && t.status !== 'resolved').length;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`action-center-type-tab${tab === item.id ? ' active' : ''}`}
              onClick={() => onTabChange(item.id)}
            >
              {item.label}
              {count > 0 ? <span className="action-center-type-tab-count">{count}</span> : null}
            </button>
          );
        })}
      </div>

      {tab === 'analysis_review' ? (
        <AdminAnalysisReviewView
          embedMode
          onPublished={onAnalysisPublished}
          customers={customers}
          onOpenCustomer={onOpenCustomer}
        />
      ) : (
        <AdminTicketsView
          embedMode
          tickets={tickets}
          customerTickets={customerTickets}
          analysisTickets={analysisTickets}
          portalCustomers={portalCustomers}
          fixedKindFilter={tab}
          onResolveServiceTicket={onResolveServiceTicket}
          onResolveAnalysisTicket={onResolveAnalysisTicket}
          onDismissStatementReview={onDismissStatementReview}
          onSetServiceInProgress={onSetServiceInProgress}
          onOpenAnalysisReview={(id) => {
            onTabChange('analysis_review');
            onSelectAnalysisReview(id);
          }}
          initialSelectedTicketId={initialSelectedTicketId}
        />
      )}
    </div>
  );
}
