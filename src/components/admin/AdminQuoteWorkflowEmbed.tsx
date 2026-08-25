'use client';

import type { Lead } from '@/components/LeadsView';
import { QuoteRequestDetailPanel } from '@/components/admin/QuoteRequestDetailPanel';
import { BRAND } from '@/lib/ui/brand-tokens';

export function AdminQuoteWorkflowEmbed({
  quoteRequestId,
  onClose,
  breadcrumb,
  currentUserId,
  linkedLead = null,
  onConvertLead,
  onOpenLeads,
  onRefreshLeads,
  onUpdated,
  onActionWorkUpdated,
  onViewPublishedQuoteAsCustomer,
}: {
  quoteRequestId: string;
  onClose: () => void;
  breadcrumb?: string;
  currentUserId?: string;
  linkedLead?: Lead | null;
  onConvertLead?: (lead: Lead) => void;
  onOpenLeads?: () => void;
  onRefreshLeads?: () => void | Promise<void>;
  onUpdated?: () => void;
  onActionWorkUpdated?: () => void;
  onViewPublishedQuoteAsCustomer?: (
    quoteRequestId: string,
    contact?: { name?: string; email?: string },
  ) => void;
}) {
  return (
    <div className="admin-quote-workflow-embed">
      {breadcrumb ? (
        <div
          style={{
            fontSize: 13,
            color: BRAND.gray,
            marginBottom: 12,
          }}
        >
          {breadcrumb}
        </div>
      ) : null}
      <QuoteRequestDetailPanel
        quoteRequestId={quoteRequestId}
        onClose={onClose}
        onUpdated={onUpdated}
        currentUserId={currentUserId}
        onActionWorkUpdated={onActionWorkUpdated}
        linkedLead={linkedLead}
        onConvertLead={onConvertLead}
        onOpenLeads={onOpenLeads}
        onRefreshLeads={onRefreshLeads}
        onViewPublishedQuoteAsCustomer={onViewPublishedQuoteAsCustomer}
        hideCloseButton
        backLabel="Back to account"
      />
    </div>
  );
}
