'use client';

import type { Lead } from '@/components/LeadsView';
import { QuoteRequestDetailPanel } from '@/components/admin/QuoteRequestDetailPanel';
import { BRAND } from '@/lib/ui/brand-tokens';

const iconBase = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const ChevronLeftIcon = () => (
  <svg {...iconBase}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: BRAND.white,
            border: `1px solid ${BRAND.grayBorder}`,
            borderRadius: 6,
            padding: '8px 14px',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            color: BRAND.grayDark,
            cursor: 'pointer',
          }}
        >
          <ChevronLeftIcon /> Back
        </button>
        {breadcrumb ? (
          <span style={{ fontSize: 13, color: BRAND.gray }}>
            {breadcrumb}
          </span>
        ) : null}
      </div>
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
      />
    </div>
  );
}
