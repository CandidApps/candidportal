'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { PhoneLink } from '@/components/shared/PhoneLink';
import { ActionWorkBar } from '@/components/admin/ActionWorkBar';
import { TeamNotesPanel } from '@/components/admin/TeamNotesPanel';
import { DocumentEmbed } from '@/components/admin/DocumentEmbed';
import { buildActionKey } from '@/lib/admin-action-work';
import type { MemberReviewRequestRow } from '@/lib/services/member-review-requests';
import type { QuoteRequestRow } from '@/lib/services/quote-requests';
import {
  dedupeQuoteRequirementAnswers,
  extractCustomerAdditionalNotes,
  resolveQuoteServiceLabel,
} from '@/lib/services/quote-requests';
import { launchAdminZohoCompose } from '@/lib/email/admin-compose';
import { ActionReplyComposer } from '@/components/admin/ActionReplyComposer';
import { SubmitContractToSupplierModal } from '@/components/admin/SubmitContractToSupplierModal';
import { AcceptedQuotePackageDetails } from '@/components/admin/AcceptedQuotePackageDetails';
import { DealPipelineTimeline } from '@/components/admin/DealPipelineTimeline';
import {
  SupplierContractReplyModal,
  type SupplierReplyPreview,
} from '@/components/admin/SupplierContractReplyModal';
import { EditableContractLink } from '@/components/admin/EditableContractLink';
import {
  CompleteDealRegistrationModal,
  type ConvertRegistrationPayload,
} from '@/components/admin/CompleteDealRegistrationModal';
import type { PipelineContractExtras } from '@/lib/crm/contract-service-pricing';
import type { CandidContractRecord } from '@/lib/customer-records';
import type { Location } from '@/components/CustomersView';
import {
  CONTRACT_DEAL_STAGE_LABEL,
  dealAccountDisplayName,
  dealContactDisplayName,
} from '@/lib/services/contract-submit-actions';
import {
  buildCustomerContractEmailBody,
  buildCustomerContractEmailSubject,
  buildSupplierReplyEmailBody,
  buildSupplierReplyEmailSubject,
} from '@/lib/quotes/contract-submit-email';
import type { QuotePackageSummary } from '@/lib/quotes/quote-package-summary';
import type { PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';

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
  contractSubmitAction?: import('@/lib/services/contract-submit-actions').ContractSubmitActionRow | null;
  onResolveContractSubmit?: (actionId: string) => void;
  onSetContractSubmitInProgress?: (actionId: string) => void;
  onContractPipelineUpdated?: () => void;
  onReplyServiceTicket?: (ticketId: string, message: string) => Promise<boolean>;
  onReplyReviewRequest?: (requestId: string, message: string) => Promise<boolean>;
  onOpenCustomer?: (customerId: string) => void;
  onOpenLead?: (leadKey: string) => void;
  portalLeads?: import('@/components/LeadsView').Lead[];
  customers?: import('@/components/CustomersView').Customer[];
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
  contractSubmitAction,
  onResolveContractSubmit,
  onSetContractSubmitInProgress,
  onContractPipelineUpdated,
  onReplyServiceTicket,
  onReplyReviewRequest,
  onOpenCustomer,
  onOpenLead,
  portalLeads = [],
  customers = [],
}: AdminTicketDetailPanelProps) {
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [checkingContract, setCheckingContract] = useState(false);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [quotePackage, setQuotePackage] = useState<QuotePackageSummary | null>(null);
  const [publishedSnapshot, setPublishedSnapshot] = useState<PublishedAnalysisSnapshot | null>(
    null,
  );
  const [replyReview, setReplyReview] = useState<{
    reply: SupplierReplyPreview;
    reason?: string;
  } | null>(null);
  const [importingReply, setImportingReply] = useState(false);
  const [registrationPayload, setRegistrationPayload] =
    useState<ConvertRegistrationPayload | null>(null);

  const linkedLead = useMemo(() => {
    if (!contractSubmitAction) return null;
    if (contractSubmitAction.lead_id) {
      const byRow = portalLeads.find((l) => l.portalLeadRowId === contractSubmitAction.lead_id);
      if (byRow) return byRow;
    }
    if (contractSubmitAction.analysis_review_id) {
      const byAnalysis = portalLeads.find(
        (l) => l.analysisReviewId === contractSubmitAction.analysis_review_id,
      );
      if (byAnalysis) return byAnalysis;
    }
    if (contractSubmitAction.quote_request_id) {
      return (
        portalLeads.find((l) => l.quoteRequestId === contractSubmitAction.quote_request_id) ?? null
      );
    }
    return null;
  }, [contractSubmitAction, portalLeads]);

  const accountCustomerId = useMemo(() => {
    const fromAction = contractSubmitAction?.crm_customer_external_id?.trim();
    if (fromAction) return fromAction;
    const fromLead = linkedLead?.convertedCustomerId?.trim();
    if (fromLead) return fromLead;
    const name = ticket.customerName?.trim();
    if (!name) return null;
    const match = customers.find(
      (c) =>
        c.company === name ||
        c.companyLegal === name ||
        c.portal?.displayName === name ||
        c.portal?.bmwMerchantName === name,
    );
    return match?.id ?? null;
  }, [
    contractSubmitAction?.crm_customer_external_id,
    linkedLead?.convertedCustomerId,
    ticket.customerName,
    customers,
  ]);

  const leadOpenKey =
    contractSubmitAction?.lead_id ||
    linkedLead?.portalLeadRowId ||
    linkedLead?.id ||
    null;

  useEffect(() => {
    if (!contractSubmitAction?.id) {
      setQuotePackage(null);
      setPublishedSnapshot(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/contract-submit-actions/${contractSubmitAction.id}/quote-package`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          quotePackage?: QuotePackageSummary | null;
          publishedSnapshot?: PublishedAnalysisSnapshot | null;
        };
        if (cancelled) return;
        setQuotePackage(data.quotePackage ?? null);
        setPublishedSnapshot(data.publishedSnapshot ?? null);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contractSubmitAction?.id]);

  useEffect(() => {
    if (!contractSubmitAction?.id) return;
    const onSent = (event: Event) => {
      const detail = (event as CustomEvent<{ contractSubmitActionId?: string }>).detail;
      if (detail?.contractSubmitActionId !== contractSubmitAction.id) return;
      onNotify?.('Supplier / customer email sent — deal stage updated.');
      onContractPipelineUpdated?.();
    };
    window.addEventListener('candid:admin-zoho-compose-sent', onSent);
    return () => window.removeEventListener('candid:admin-zoho-compose-sent', onSent);
  }, [contractSubmitAction?.id, onNotify, onContractPipelineUpdated]);

  const refreshPipeline = () => {
    onContractPipelineUpdated?.();
  };

  const patchContractOp = async (
    op: 'mark_signed' | 'convert' | 'mark_supplier_received',
    successMsg: string,
  ) => {
    if (!contractSubmitAction || pipelineBusy) return;
    setPipelineBusy(true);
    try {
      const res = await fetch('/api/admin/contract-submit-actions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: contractSubmitAction.id, op }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        action?: typeof contractSubmitAction;
        dealExternalId?: string;
        pipelineExtras?: PipelineContractExtras;
        contract?: CandidContractRecord | null;
        locations?: Location[];
      };
      if (!res.ok) {
        onNotify?.(data.error ?? 'Update failed');
        return;
      }
      onNotify?.(successMsg);
      refreshPipeline();
      if (op === 'convert' && data.dealExternalId) {
        setRegistrationPayload({
          action: data.action ?? contractSubmitAction,
          dealExternalId: data.dealExternalId,
          pipelineExtras: data.pipelineExtras ?? {},
          contract: data.contract ?? null,
          locations: data.locations ?? [],
        });
      }
    } finally {
      setPipelineBusy(false);
    }
  };

  const checkSupplierContract = async () => {
    if (!contractSubmitAction || checkingContract) return;
    setCheckingContract(true);
    try {
      const res = await fetch(
        `/api/admin/contract-submit-actions/${contractSubmitAction.id}/check-contract-reply`,
        { method: 'POST' },
      );
      const data = (await res.json()) as {
        detected?: boolean;
        reason?: string;
        error?: string;
        reply?: SupplierReplyPreview;
      };
      if (!res.ok) {
        onNotify?.(data.error ?? 'Check failed');
        return;
      }
      if (data.detected) {
        onNotify?.('Supplier contract detected — Submit to customer action is ready.');
        refreshPipeline();
        onClose();
        return;
      }
      if (data.reply) {
        setReplyReview({ reply: data.reply, reason: data.reason });
        onNotify?.(data.reason ?? 'Review the supplier reply to import the contract.');
      } else {
        onNotify?.(data.reason ?? 'No contract found yet');
      }
    } finally {
      setCheckingContract(false);
    }
  };

  const importSupplierReply = async (input: { url?: string | null; name?: string | null }) => {
    if (!contractSubmitAction || !replyReview || importingReply) return;
    setImportingReply(true);
    try {
      const res = await fetch(
        `/api/admin/contract-submit-actions/${contractSubmitAction.id}/check-contract-reply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            importReply: {
              messageId: replyReview.reply.messageId,
              folderId: replyReview.reply.folderId,
              from: replyReview.reply.from,
              subject: replyReview.reply.subject,
              body: replyReview.reply.bodyText,
              hasAttachment: replyReview.reply.hasAttachment,
              url: input.url,
              name: input.name,
            },
          }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        onNotify?.(data.error ?? 'Import failed');
        return;
      }
      setReplyReview(null);
      onNotify?.('Supplier contract imported from email — ready to send to customer.');
      refreshPipeline();
      onClose();
    } finally {
      setImportingReply(false);
    }
  };

  const sendContractToCustomer = () => {
    if (!contractSubmitAction) return;
    launchAdminZohoCompose({
      to: contractSubmitAction.customer_email || ticket.customerEmail,
      subject: buildCustomerContractEmailSubject(contractSubmitAction),
      body: buildCustomerContractEmailBody(contractSubmitAction, {
        snapshot: publishedSnapshot,
      }),
      contextLabel: `${contractSubmitAction.service_label} — customer contract`,
      contractSubmitActionId: contractSubmitAction.id,
      contractSubmitIntent: 'customer',
    });
  };

  const replyToSupplier = () => {
    if (!contractSubmitAction) return;
    const to = contractSubmitAction.supplier_contact_email?.trim() || '';
    if (!to) {
      onNotify?.('No supplier email on file — add the address in compose.');
    }
    launchAdminZohoCompose({
      to,
      subject: buildSupplierReplyEmailSubject(contractSubmitAction),
      body: buildSupplierReplyEmailBody(contractSubmitAction),
      contextLabel: `${contractSubmitAction.vendor_name || contractSubmitAction.service_label} — reply to supplier`,
      contractSubmitActionId: contractSubmitAction.id,
      contractSubmitIntent: 'supplier_reply',
      supplierContactEmail: to || undefined,
      vendorName: contractSubmitAction.vendor_name || undefined,
      providerId: contractSubmitAction.provider_id || undefined,
    });
  };

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
              {accountCustomerId && onOpenCustomer ? (
                <button
                  type="button"
                  className="ticket-detail-account-link"
                  onClick={() => onOpenCustomer(accountCustomerId)}
                  title="Open account"
                >
                  {contractSubmitAction
                    ? dealAccountDisplayName(contractSubmitAction)
                    : ticket.customerName}
                </button>
              ) : (
                (contractSubmitAction
                  ? dealAccountDisplayName(contractSubmitAction)
                  : ticket.customerName)
              )}
              {contractSubmitAction && dealContactDisplayName(contractSubmitAction)
                ? ` · ${dealContactDisplayName(contractSubmitAction)}`
                : ''}
              {ticket.customerEmail ? ` · ${ticket.customerEmail}` : ''} · {ticket.timeLabel}
            </p>
          </div>
          <div className="ticket-detail-header-actions">
            {leadOpenKey && onOpenLead ? (
              <button
                type="button"
                className="admin-ticket-btn"
                onClick={() => onOpenLead(leadOpenKey)}
              >
                View lead
              </button>
            ) : null}
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

            {!statementReview &&
              !serviceTicket &&
              !analysisTicket &&
              !reviewRequest &&
              !quoteRequest &&
              !contractSubmitAction && (
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
                  <Field label="Service">{resolveQuoteServiceLabel(quoteRequest)}</Field>
                  {quoteRequest.company && <Field label="Company">{quoteRequest.company}</Field>}
                  {quoteRequest.contact_name && <Field label="Contact">{quoteRequest.contact_name}</Field>}
                  {quoteRequest.contact_email && <Field label="Email">{quoteRequest.contact_email}</Field>}
                  {quoteRequest.contact_phone && <Field label="Phone"><PhoneLink phone={quoteRequest.contact_phone} /></Field>}
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
                  {dedupeQuoteRequirementAnswers(quoteRequest).map((row) => (
                    <Field key={row.label} label={row.label}>
                      {row.value}
                    </Field>
                  ))}
                  {extractCustomerAdditionalNotes(quoteRequest).map((paragraph, index) => (
                    <Field key={`note-${index}`} label={index === 0 ? 'Additional from customer' : ' '}>
                      <p className="quote-request-additional-note-inline">{paragraph}</p>
                    </Field>
                  ))}
                </div>
              </div>
            )}

            {ticket.kind === 'submit_contract' && contractSubmitAction && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <div className="card-title">Accepted quote — submit contract</div>
                </div>
                <div className="card-body ticket-detail-grid">
                  <DealPipelineTimeline
                    leadId={contractSubmitAction.lead_id}
                    actionId={contractSubmitAction.id}
                    customerExternalId={contractSubmitAction.crm_customer_external_id}
                    dealStage={contractSubmitAction.status}
                    action={contractSubmitAction}
                    compact
                    onPipelineUpdated={onContractPipelineUpdated}
                  />
                  <div className="ticket-detail-meta-row">
                    <Field label="Stage">
                      {CONTRACT_DEAL_STAGE_LABEL[contractSubmitAction.status]}
                    </Field>
                    <Field label="Service">{contractSubmitAction.service_label}</Field>
                    {contractSubmitAction.vendor_name ? (
                      <Field label="Vendor">{contractSubmitAction.vendor_name}</Field>
                    ) : (
                      <Field label="Vendor">—</Field>
                    )}
                  </div>
                  {contractSubmitAction.pay_source ? (
                    <Field label="Pay source">{contractSubmitAction.pay_source}</Field>
                  ) : null}
                  {contractSubmitAction.details ? (
                    <Field label="Customer details">
                      <p className="ticket-detail-message">{contractSubmitAction.details}</p>
                    </Field>
                  ) : null}
                  {quotePackage ? (
                    <Field label="Quote package">
                      <AcceptedQuotePackageDetails pkg={quotePackage} />
                    </Field>
                  ) : contractSubmitAction.acceptance?.monthlyTotal != null ? (
                    <Field label="Selected monthly">
                      ${contractSubmitAction.acceptance.monthlyTotal.toFixed(2)}
                      {contractSubmitAction.acceptance.annualSavings != null
                        ? ` · Est. annual savings $${contractSubmitAction.acceptance.annualSavings.toFixed(2)}`
                        : ''}
                    </Field>
                  ) : null}
                  <EditableContractLink
                    action={contractSubmitAction}
                    compact
                    onSaved={() => onContractPipelineUpdated?.()}
                  />
                  <Field label="Accepted">
                    {new Date(contractSubmitAction.created_at).toLocaleString()}
                  </Field>
                </div>
              </div>
            )}

            {(ticket.kind === 'submit_contract_to_customer') && contractSubmitAction && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <div className="card-title">Submit contract to customer</div>
                </div>
                <div className="card-body ticket-detail-grid">
                  <DealPipelineTimeline
                    leadId={contractSubmitAction.lead_id}
                    actionId={contractSubmitAction.id}
                    customerExternalId={contractSubmitAction.crm_customer_external_id}
                    dealStage={contractSubmitAction.status}
                    action={contractSubmitAction}
                    compact
                    onPipelineUpdated={onContractPipelineUpdated}
                  />
                  <Field label="Stage">
                    {CONTRACT_DEAL_STAGE_LABEL[contractSubmitAction.status]}
                  </Field>
                  <Field label="Service">{contractSubmitAction.service_label}</Field>
                  <EditableContractLink
                    action={contractSubmitAction}
                    compact
                    onSaved={() => onContractPipelineUpdated?.()}
                  />
                  {contractSubmitAction.pay_source ? (
                    <Field label="Pay source">{contractSubmitAction.pay_source}</Field>
                  ) : null}
                  {quotePackage ? (
                    <Field label="Quote package">
                      <AcceptedQuotePackageDetails pkg={quotePackage} />
                    </Field>
                  ) : contractSubmitAction.acceptance?.monthlyTotal != null ? (
                    <Field label="Selected monthly">
                      ${contractSubmitAction.acceptance.monthlyTotal.toFixed(2)}
                    </Field>
                  ) : null}
                </div>
              </div>
            )}

            {ticket.kind === 'service' && serviceTicket && ticket.status !== 'resolved' && onReplyServiceTicket ? (
              <ActionReplyComposer
                onSubmit={async (message) => {
                  const ok = await onReplyServiceTicket(ticket.sourceId, message);
                  if (ok) onNotify?.('Reply sent to customer.');
                }}
              />
            ) : null}

            {ticket.kind === 'review_request' && reviewRequest && ticket.status !== 'resolved' && onReplyReviewRequest ? (
              <ActionReplyComposer
                label="Reply with review update"
                placeholder="Share findings or next steps with the customer…"
                onSubmit={async (message) => {
                  const ok = await onReplyReviewRequest(ticket.sourceId, message);
                  if (ok) onNotify?.('Review update sent to customer.');
                }}
              />
            ) : null}

            <TeamNotesPanel
              contextType="action"
              contextKey={buildActionKey(ticket.kind, ticket.sourceId)}
              compact
            />
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
          {ticket.kind === 'submit_contract' && ticket.status !== 'resolved' && contractSubmitAction && (
            <>
              {contractSubmitAction.status === 'quote_accepted' ? (
                <button
                  type="button"
                  className="admin-ticket-btn primary"
                  onClick={() => setSupplierModalOpen(true)}
                >
                  Submit to supplier
                </button>
              ) : null}
              {contractSubmitAction.status === 'supplier_contract_requested' ? (
                <button
                  type="button"
                  className="admin-ticket-btn primary"
                  disabled={checkingContract}
                  onClick={() => void checkSupplierContract()}
                >
                  {checkingContract ? 'Checking…' : 'Check for supplier contract'}
                </button>
              ) : null}
              {contractSubmitAction.status === 'supplier_contract_requested' ? (
                <button
                  type="button"
                  className="admin-ticket-btn"
                  disabled={pipelineBusy}
                  onClick={() =>
                    void patchContractOp(
                      'mark_supplier_received',
                      'Marked supplier contract received — ready to send to customer.',
                    )
                  }
                >
                  Mark contract received
                </button>
              ) : null}
              <button
                type="button"
                className="admin-ticket-btn"
                onClick={() => setSupplierModalOpen(true)}
              >
                {contractSubmitAction.status === 'quote_accepted'
                  ? 'Preview supplier email'
                  : 'Resend to supplier'}
              </button>
            </>
          )}
          {ticket.kind === 'submit_contract_to_customer' &&
            ticket.status !== 'resolved' &&
            contractSubmitAction && (
              <>
                {contractSubmitAction.status === 'supplier_contract_received' ||
                contractSubmitAction.status === 'customer_contract_sent' ? (
                  <>
                    <button
                      type="button"
                      className="admin-ticket-btn primary"
                      onClick={sendContractToCustomer}
                    >
                      {contractSubmitAction.status === 'customer_contract_sent'
                        ? 'Resend contract to customer'
                        : 'Send contract to customer'}
                    </button>
                    <button type="button" className="admin-ticket-btn" onClick={replyToSupplier}>
                      Reply to supplier
                    </button>
                  </>
                ) : null}
                {contractSubmitAction.status === 'customer_contract_sent' ? (
                  <button
                    type="button"
                    className="admin-ticket-btn"
                    disabled={pipelineBusy}
                    onClick={() =>
                      void patchContractOp('mark_signed', 'Marked customer contract as signed.')
                    }
                  >
                    Mark contract signed
                  </button>
                ) : null}
                {contractSubmitAction.status === 'customer_contract_signed' ? (
                  <>
                    <button type="button" className="admin-ticket-btn" onClick={replyToSupplier}>
                      Reply to supplier
                    </button>
                    <button
                      type="button"
                      className="admin-ticket-btn primary"
                      disabled={pipelineBusy}
                      onClick={() =>
                        void patchContractOp(
                          'convert',
                          'Lead converted — deal is now an active Candid service.',
                        )
                      }
                    >
                      Convert to customer / activate service
                    </button>
                  </>
                ) : null}
              </>
            )}
          <span className="ticket-detail-footer-spacer" />
          <button type="button" className="admin-ticket-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      {supplierModalOpen && contractSubmitAction ? (
        <SubmitContractToSupplierModal
          action={contractSubmitAction}
          onClose={() => setSupplierModalOpen(false)}
          onQueued={() => {
            onNotify?.('Compose opened — send the email to advance this deal.');
            refreshPipeline();
          }}
        />
      ) : null}
      {replyReview ? (
        <SupplierContractReplyModal
          reply={replyReview.reply}
          reason={replyReview.reason}
          busy={importingReply}
          onClose={() => setReplyReview(null)}
          onImport={(input) => void importSupplierReply(input)}
        />
      ) : null}
      {registrationPayload ? (
        <CompleteDealRegistrationModal
          payload={registrationPayload}
          onClose={() => setRegistrationPayload(null)}
          onSaved={() => {
            onNotify?.('Deal registration saved.');
            refreshPipeline();
          }}
        />
      ) : null}
    </div>
  );
}
