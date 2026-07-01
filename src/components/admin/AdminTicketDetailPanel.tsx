'use client';

import { useMemo, type ReactNode } from 'react';
import type { UnifiedAdminTicket } from '@/lib/admin-tickets';
import { TICKET_KIND_LABEL } from '@/lib/admin-tickets';
import type { CustomerTicketRow } from '@/lib/services/customer-tickets';
import type { AnalysisTicketRow } from '@/lib/services/analysis-tickets';
import type { DemoStatementReview } from '@/lib/demo/admin-portfolio';
import { formatAdminCurrency } from '@/lib/demo/admin-portfolio';
import {
  getTicketAgentBrief,
  type TicketAction,
  type TicketActionKind,
  type TicketAgentInput,
} from '@/lib/ticket-action-agent';
import type { CustomerPortalData } from '@/lib/portal-import/merge';
import { findPortalCustomerForTicket } from '@/lib/ticket-hank-chat';
import { TicketHankChat } from '@/components/admin/TicketHankChat';
import { ActionWorkBar } from '@/components/admin/ActionWorkBar';
import { TeamNotesPanel } from '@/components/admin/TeamNotesPanel';
import { DocumentEmbed } from '@/components/admin/DocumentEmbed';
import { buildActionKey } from '@/lib/admin-action-work';
import type { MemberReviewRequestRow } from '@/lib/services/member-review-requests';
import type { QuoteRequestRow } from '@/lib/services/quote-requests';
import {
  formatQuoteRequestAnswers,
  formatQuoteRequestDetail,
  serviceTypeLabel,
} from '@/lib/services/quote-requests';
import { launchAdminZohoCompose } from '@/lib/email/admin-compose';

type AdminTicketDetailPanelProps = {
  ticket: UnifiedAdminTicket;
  serviceTicket?: CustomerTicketRow | null;
  analysisTicket?: AnalysisTicketRow | null;
  statementReview?: DemoStatementReview | null;
  onClose: () => void;
  onResolveServiceTicket?: (ticketId: string) => void;
  onResolveAnalysisTicket?: (ticketId: string) => void;
  onDismissStatementReview?: (sourceId: string) => void;
  onSetServiceInProgress?: (ticketId: string) => void;
  onNotify?: (message: string) => void;
  portalCustomers?: { company: string; portal?: CustomerPortalData }[];
  currentUserId?: string;
  onActionWorkUpdated?: () => void;
  reviewRequest?: MemberReviewRequestRow | null;
  onResolveReviewRequest?: (requestId: string) => void;
  onSetReviewInProgress?: (requestId: string) => void;
  quoteRequest?: QuoteRequestRow | null;
  onResolveQuoteRequest?: (requestId: string) => void;
  onSetQuoteInProgress?: (requestId: string) => void;
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ticket-detail-field">
      <div className="ticket-detail-field-label">{label}</div>
      <div className="ticket-detail-field-value">{children}</div>
    </div>
  );
}

function StatementPreview({
  review,
  documentUrl,
}: {
  review: DemoStatementReview;
  documentUrl?: string | null;
}) {
  const p = review.statementPreview;
  return (
    <div className="ticket-statement-preview">
      <div className="ticket-statement-summary">
        <div className="ticket-statement-doc-bar">
          <span className="ticket-statement-doc-icon">📄</span>
          <div>
            <div className="ticket-statement-doc-name">{review.fileName}</div>
            <div className="ticket-statement-doc-meta">
              {review.merchantName} · {p.processor} · {p.statementDate}
            </div>
          </div>
        </div>
        <div className="ticket-statement-metrics">
          <div>
            <span className="ticket-statement-metric-label">Volume</span>
            <span className="ticket-statement-metric-val">{formatAdminCurrency(p.totalVolume)}</span>
          </div>
          <div>
            <span className="ticket-statement-metric-label">Total fees</span>
            <span className="ticket-statement-metric-val">{formatAdminCurrency(p.totalFees)}</span>
          </div>
          <div>
            <span className="ticket-statement-metric-label">Effective rate</span>
            <span className="ticket-statement-metric-val">{p.effectiveRate}%</span>
          </div>
        </div>
        <ul className="ticket-statement-highlights">
          {p.highlights.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </div>
      <DocumentEmbed
        url={documentUrl ?? review.documentUrl ?? null}
        title={`Statement: ${review.fileName}`}
        filename={review.fileName}
        mimeType="application/pdf"
        emptyMessage="Statement PDF will appear here once the upload is linked to storage."
      />
    </div>
  );
}

export function AdminTicketDetailPanel({
  ticket,
  serviceTicket,
  analysisTicket,
  statementReview,
  onClose,
  onResolveServiceTicket,
  onResolveAnalysisTicket,
  onDismissStatementReview,
  onSetServiceInProgress,
  onNotify,
  portalCustomers = [],
  currentUserId,
  onActionWorkUpdated,
  reviewRequest,
  onResolveReviewRequest,
  onSetReviewInProgress,
  quoteRequest,
  onResolveQuoteRequest,
  onSetQuoteInProgress,
}: AdminTicketDetailPanelProps) {
  const agentInput = useMemo((): TicketAgentInput => {
    if (ticket.kind === 'statement' && statementReview) {
      return {
        kind: 'statement',
        title: ticket.title,
        detail: ticket.detail,
        customerName: ticket.customerName,
        customerEmail: ticket.customerEmail,
        fileName: statementReview.fileName,
        statementPreview: statementReview.statementPreview,
      };
    }
    if (ticket.kind === 'service' && serviceTicket) {
      return {
        kind: 'service',
        title: ticket.title,
        detail: ticket.detail,
        customerName: ticket.customerName,
        customerEmail: ticket.customerEmail,
        serviceName: serviceTicket.service_name,
        subject: serviceTicket.subject,
        message: serviceTicket.message,
      };
    }
    if (ticket.kind === 'analysis' && analysisTicket) {
      return {
        kind: 'analysis',
        title: ticket.title,
        detail: ticket.detail,
        customerName: ticket.customerName,
        customerEmail: ticket.customerEmail,
        question: analysisTicket.question,
      };
    }
    return {
      kind: ticket.kind,
      title: ticket.title,
      detail: ticket.detail,
      customerName: ticket.customerName,
      customerEmail: ticket.customerEmail,
    };
  }, [ticket, serviceTicket, analysisTicket, statementReview]);

  const brief = useMemo(() => getTicketAgentBrief(agentInput), [agentInput]);

  const portalCustomer = useMemo(
    () => findPortalCustomerForTicket(ticket, portalCustomers),
    [ticket, portalCustomers],
  );

  const emailCustomer = () => {
    const email = ticket.customerEmail?.trim();
    if (!email) {
      onNotify?.('No customer email on file for this action.');
      return;
    }
    const subject =
      serviceTicket?.subject ??
      (ticket.kind === 'analysis' ? 'Re: Your analysis question' : `Re: ${ticket.title}`);
    const bodyParts: string[] = [`Hi ${ticket.customerName || 'there'},`, '', ''];
    if (serviceTicket?.message) {
      bodyParts.push('---', 'Your message:', serviceTicket.message, '', '---', '');
    } else if (analysisTicket?.question) {
      bodyParts.push('---', 'Your question:', analysisTicket.question, '', '---', '');
    }
    bodyParts.push('Best regards,', 'Candid Support');
    const body = bodyParts.join('\n');
    launchAdminZohoCompose({
      to: email,
      subject,
      body,
      contextLabel: ticket.customerName || undefined,
    });
  };

  const runAction = (action: TicketAction) => {
    if (action.kind === 'link' && action.href) {
      window.open(action.href, '_blank', 'noopener,noreferrer');
      return;
    }

    const handlers: Partial<Record<TicketActionKind, () => void>> = {
      resolve: () => {
        if (ticket.kind === 'service') onResolveServiceTicket?.(ticket.sourceId);
        if (ticket.kind === 'analysis') onResolveAnalysisTicket?.(ticket.sourceId);
      },
      mark_reviewed: () => onDismissStatementReview?.(ticket.sourceId),
      in_progress: () => onSetServiceInProgress?.(ticket.sourceId),
      email_customer: () => emailCustomer(),
      open_analysis: () => {
        onNotify?.('Open Customers → select merchant to run analysis (full navigation coming soon).');
      },
    };

    handlers[action.kind]?.();
  };

  return (
    <div
      className="modal-overlay open ticket-detail-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ticket-detail-panel" onClick={(e) => e.stopPropagation()}>
        <div className="ticket-detail-header">
          <div>
            <div className="ticket-detail-badges">
              <span className={`admin-ticket-pill admin-ticket-pill--${ticket.kind}`}>
                {TICKET_KIND_LABEL[ticket.kind]}
              </span>
              <span className={`admin-status-pill admin-status-pill--${ticket.status}`}>
                {ticket.status.replace('_', ' ')}
              </span>
            </div>
            <h3 className="ticket-detail-title">{ticket.title}</h3>
            <p className="ticket-detail-meta">
              {ticket.customerName}
              {ticket.customerEmail ? ` · ${ticket.customerEmail}` : ''} · {ticket.timeLabel}
            </p>
          </div>
          <div className="ticket-detail-header-actions">
            <button
              type="button"
              className="admin-ticket-btn primary"
              onClick={emailCustomer}
              disabled={!ticket.customerEmail?.trim()}
              title={ticket.customerEmail || 'No email on file'}
            >
              Email customer
            </button>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        <div className="ticket-detail-body">
          <div className="ticket-detail-main">
            <ActionWorkBar
              actionKind={ticket.kind}
              sourceId={ticket.sourceId}
              currentUserId={currentUserId}
              assignees={ticket.assignees}
              onUpdated={onActionWorkUpdated}
            />

            <TeamNotesPanel
              contextType="action"
              contextKey={buildActionKey(ticket.kind, ticket.sourceId)}
              compact
            />

            {ticket.kind === 'statement' && statementReview && (
              <StatementPreview review={statementReview} />
            )}

            {ticket.kind === 'service' && serviceTicket && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <div className="card-title">Ticket details</div>
                </div>
                <div className="card-body ticket-detail-grid">
                  <Field label="Service">{serviceTicket.service_name}</Field>
                  <Field label="Subject">{serviceTicket.subject}</Field>
                  <Field label="Message">
                    <p className="ticket-detail-message">{serviceTicket.message}</p>
                  </Field>
                  <Field label="Status">{serviceTicket.status.replace('_', ' ')}</Field>
                </div>
              </div>
            )}

            {ticket.kind === 'analysis' && analysisTicket && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <div className="card-title">Analysis question</div>
                </div>
                <div className="card-body ticket-detail-grid">
                  {analysisTicket.merchant_name && (
                    <Field label="Merchant">{analysisTicket.merchant_name}</Field>
                  )}
                  <Field label="Question">
                    <p className="ticket-detail-message">{analysisTicket.question}</p>
                  </Field>
                  {analysisTicket.last_ai_reply && (
                    <Field label="Last AI reply">
                      <p className="ticket-detail-message" style={{ color: 'var(--gray)' }}>
                        {analysisTicket.last_ai_reply}
                      </p>
                    </Field>
                  )}
                  {analysisTicket.analysis_context && (
                    <Field label="Context snapshot">
                      <p className="ticket-detail-message" style={{ fontSize: 12, color: 'var(--gray)' }}>
                        Analysis data on file — open merchant workspace for full charts and pricing.
                      </p>
                    </Field>
                  )}
                </div>
              </div>
            )}

            {!statementReview && !serviceTicket && !analysisTicket && !reviewRequest && !quoteRequest && (
              <p className="ticket-detail-fallback">{ticket.detail}</p>
            )}

            {ticket.kind === 'review_request' && reviewRequest && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <div className="card-title">Member review request</div>
                </div>
                <div className="card-body ticket-detail-grid">
                  <Field label="Service">{reviewRequest.service_name}</Field>
                  {reviewRequest.vendor_name && <Field label="Vendor">{reviewRequest.vendor_name}</Field>}
                  <Field label="Source">
                    {reviewRequest.request_source === 'savings_opportunity'
                      ? 'My Savings Opportunities'
                      : 'My Services'}
                  </Field>
                  <Field label="Request">
                    <p className="ticket-detail-message">{reviewRequest.message}</p>
                  </Field>
                </div>
              </div>
            )}

            {ticket.kind === 'quote_request' && quoteRequest && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <div className="card-title">Quote request</div>
                </div>
                <div className="card-body ticket-detail-grid">
                  <Field label="Request type">
                    {quoteRequest.mode === 'add-services' ? 'Add services / users' : 'New quote'}
                  </Field>
                  <Field label="Service">{serviceTypeLabel(quoteRequest.service_type_id)}</Field>
                  {quoteRequest.company && <Field label="Company">{quoteRequest.company}</Field>}
                  {quoteRequest.contact_name && <Field label="Contact">{quoteRequest.contact_name}</Field>}
                  {quoteRequest.contact_email && <Field label="Email">{quoteRequest.contact_email}</Field>}
                  {quoteRequest.contact_phone && <Field label="Phone">{quoteRequest.contact_phone}</Field>}
                  {quoteRequest.vendor_names?.length ? (
                    <Field label="Vendors">{quoteRequest.vendor_names.join(', ')}</Field>
                  ) : null}
                  {quoteRequest.location?.city ? (
                    <Field label="Location">
                      {[
                        quoteRequest.location.label,
                        quoteRequest.location.street,
                        [quoteRequest.location.city, quoteRequest.location.state, quoteRequest.location.zip]
                          .filter(Boolean)
                          .join(', '),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Field>
                  ) : null}
                  {formatQuoteRequestAnswers(quoteRequest).map((row) => (
                    <Field key={row.label} label={row.label}>
                      {row.value}
                    </Field>
                  ))}
                  {quoteRequest.note?.trim() ? (
                    <Field label="Notes">
                      <p className="ticket-detail-message">{quoteRequest.note}</p>
                    </Field>
                  ) : null}
                  <Field label="Summary">
                    <p className="ticket-detail-message">{formatQuoteRequestDetail(quoteRequest)}</p>
                  </Field>
                </div>
              </div>
            )}
          </div>

          <aside className="ticket-detail-aside">
            <TicketHankChat
              ticket={ticket}
              agentInput={agentInput}
              brief={brief}
              portalCustomer={portalCustomer}
              onAction={runAction}
            />
          </aside>
        </div>

        <div className="ticket-detail-footer">
          {ticket.kind === 'service' && ticket.status !== 'resolved' && (
            <button
              type="button"
              className="admin-ticket-btn"
              onClick={() => onSetServiceInProgress?.(ticket.sourceId)}
            >
              Set in progress
            </button>
          )}
          {ticket.kind === 'service' && ticket.status !== 'resolved' && (
            <button
              type="button"
              className="admin-ticket-btn"
              onClick={() => {
                onResolveServiceTicket?.(ticket.sourceId);
                onClose();
              }}
            >
              Mark resolved
            </button>
          )}
          {ticket.kind === 'analysis' && ticket.status !== 'resolved' && (
            <button
              type="button"
              className="admin-ticket-btn"
              onClick={() => {
                onResolveAnalysisTicket?.(ticket.sourceId);
                onClose();
              }}
            >
              Mark resolved
            </button>
          )}
          {ticket.kind === 'statement' && ticket.status !== 'resolved' && (
            <button
              type="button"
              className="admin-ticket-btn"
              onClick={() => {
                onDismissStatementReview?.(ticket.sourceId);
                onClose();
              }}
            >
              Mark reviewed
            </button>
          )}
          {ticket.kind === 'review_request' && ticket.status !== 'resolved' && (
            <>
              <button
                type="button"
                className="admin-ticket-btn"
                onClick={() => {
                  onSetReviewInProgress?.(ticket.sourceId);
                  onNotify?.('Review request marked in progress.');
                }}
              >
                Set in progress
              </button>
              <button
                type="button"
                className="admin-ticket-btn"
                onClick={() => {
                  onResolveReviewRequest?.(ticket.sourceId);
                  onClose();
                }}
              >
                Mark resolved
              </button>
            </>
          )}
          {ticket.kind === 'quote_request' && ticket.status !== 'resolved' && (
            <>
              <button
                type="button"
                className="admin-ticket-btn"
                onClick={() => {
                  onSetQuoteInProgress?.(ticket.sourceId);
                  onNotify?.('Quote request marked in progress.');
                }}
              >
                Set in progress
              </button>
              <button
                type="button"
                className="admin-ticket-btn"
                onClick={() => {
                  onResolveQuoteRequest?.(ticket.sourceId);
                  onClose();
                }}
              >
                Mark resolved
              </button>
            </>
          )}
          <span className="ticket-detail-footer-spacer" />
          <button type="button" className="admin-ticket-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
