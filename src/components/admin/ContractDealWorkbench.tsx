'use client';

import { useEffect, useState } from 'react';
import type { ContractSubmitActionRow } from '@/lib/services/contract-submit-actions';
import {
  CONTRACT_DEAL_STAGE_LABEL,
  dealAccountDisplayName,
  dealContactDisplayName,
} from '@/lib/services/contract-submit-actions';
import { AcceptedQuotePackageDetails } from '@/components/admin/AcceptedQuotePackageDetails';
import { SubmitContractToSupplierModal } from '@/components/admin/SubmitContractToSupplierModal';
import type { QuotePackageSummary } from '@/lib/quotes/quote-package-summary';
import type { PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';
import {
  buildCustomerContractEmailBody,
  buildCustomerContractEmailSubject,
  buildSupplierReplyEmailBody,
  buildSupplierReplyEmailSubject,
} from '@/lib/quotes/contract-submit-email';
import {
  ADMIN_COMPOSE_SENT_EVENT,
  launchAdminZohoCompose,
  type AdminComposeSentDetail,
} from '@/lib/email/admin-compose';
import { DealPipelineTimeline } from '@/components/admin/DealPipelineTimeline';
import {
  DealEmailPreviewModal,
  emailPayloadFromEvent,
} from '@/components/admin/DealEmailPreviewModal';
import {
  SupplierContractReplyModal,
  type SupplierReplyPreview,
} from '@/components/admin/SupplierContractReplyModal';
import { EditableContractLink } from '@/components/admin/EditableContractLink';
import type { DealActivityEventRow } from '@/lib/services/deal-activity';

type ContractDealWorkbenchProps = {
  action: ContractSubmitActionRow;
  onUpdated?: () => void;
  onClose?: () => void;
  /** When true, render as a modal overlay. Otherwise inline card. */
  asModal?: boolean;
};

export function ContractDealWorkbench({
  action: initialAction,
  onUpdated,
  onClose,
  asModal = true,
}: ContractDealWorkbenchProps) {
  const [action, setAction] = useState(initialAction);
  const [quotePackage, setQuotePackage] = useState<QuotePackageSummary | null>(null);
  const [publishedSnapshot, setPublishedSnapshot] = useState<PublishedAnalysisSnapshot | null>(
    null,
  );
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [checkingContract, setCheckingContract] = useState(false);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [composePending, setComposePending] = useState(false);
  const [emailEvent, setEmailEvent] = useState<DealActivityEventRow | null>(null);
  const [latestSupplierEmail, setLatestSupplierEmail] = useState<DealActivityEventRow | null>(
    null,
  );
  const [activityTick, setActivityTick] = useState(0);
  const [replyReview, setReplyReview] = useState<{
    reply: SupplierReplyPreview;
    reason?: string;
  } | null>(null);
  const [importingReply, setImportingReply] = useState(false);

  useEffect(() => {
    setAction(initialAction);
  }, [initialAction]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const params = new URLSearchParams({ actionId: action.id });
        const res = await fetch(`/api/admin/deal-activity?${params.toString()}`, {
          cache: 'no-store',
        });
        const data = (await res.json()) as { events?: DealActivityEventRow[] };
        if (cancelled) return;
        const emails = (data.events ?? []).filter((ev) => emailPayloadFromEvent(ev));
        const supplier =
          emails.find((ev) => {
            const p = emailPayloadFromEvent(ev);
            return p?.intent === 'supplier' || ev.to_status === 'supplier_contract_requested';
          }) ?? emails[0] ?? null;
        setLatestSupplierEmail(supplier);
      } catch {
        if (!cancelled) setLatestSupplierEmail(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [action.id, activityTick, action.status]);

  const refreshPackage = async (actionId: string) => {
    try {
      const res = await fetch(`/api/admin/contract-submit-actions/${actionId}/quote-package`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        quotePackage?: QuotePackageSummary | null;
        publishedSnapshot?: PublishedAnalysisSnapshot | null;
        acceptance?: ContractSubmitActionRow['acceptance'];
      };
      setQuotePackage(data.quotePackage ?? null);
      setPublishedSnapshot(data.publishedSnapshot ?? null);
      if (data.acceptance) {
        setAction((prev) => ({ ...prev, acceptance: data.acceptance ?? prev.acceptance }));
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void refreshPackage(action.id);
  }, [action.id]);

  const refreshAction = async () => {
    try {
      const res = await fetch('/api/admin/contract-submit-actions', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { actions?: ContractSubmitActionRow[] };
      const next = (data.actions ?? []).find((a) => a.id === action.id);
      if (next) setAction(next);
    } catch {
      /* ignore */
    }
    onUpdated?.();
  };

  useEffect(() => {
    const onSent = (event: Event) => {
      const detail = (event as CustomEvent<AdminComposeSentDetail>).detail;
      if (detail?.contractSubmitActionId !== action.id) return;
      setComposePending(false);
      setSupplierModalOpen(false);
      setNotice(
        detail.contractSubmitIntent === 'customer'
          ? 'Contract email sent to customer.'
          : detail.contractSubmitIntent === 'supplier_reply'
            ? 'Reply sent to supplier.'
            : 'Supplier contract request sent. Stage updated.',
      );
      setActivityTick((n) => n + 1);
      void refreshAction();
      void refreshPackage(action.id);
    };
    window.addEventListener(ADMIN_COMPOSE_SENT_EVENT, onSent);
    return () => window.removeEventListener(ADMIN_COMPOSE_SENT_EVENT, onSent);
  }, [action.id, onUpdated]);

  const patchOp = async (
    op: 'mark_signed' | 'convert' | 'mark_supplier_received',
    successMsg: string,
  ) => {
    if (pipelineBusy) return;
    setPipelineBusy(true);
    setNotice('');
    try {
      const res = await fetch('/api/admin/contract-submit-actions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: action.id, op }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setNotice(data.error ?? 'Update failed');
        return;
      }
      setNotice(successMsg);
      setActivityTick((n) => n + 1);
      await refreshAction();
      await refreshPackage(action.id);
    } finally {
      setPipelineBusy(false);
    }
  };

  const checkSupplierContract = async () => {
    if (checkingContract) return;
    setCheckingContract(true);
    setNotice('');
    try {
      const res = await fetch(
        `/api/admin/contract-submit-actions/${action.id}/check-contract-reply`,
        { method: 'POST' },
      );
      const data = (await res.json()) as {
        detected?: boolean;
        reason?: string;
        error?: string;
        reply?: SupplierReplyPreview;
      };
      if (!res.ok) {
        setNotice(data.error ?? 'Check failed');
        return;
      }
      if (data.detected) {
        setNotice('Supplier contract detected — ready to send to customer.');
        setActivityTick((n) => n + 1);
        await refreshAction();
        return;
      }
      if (data.reply) {
        setReplyReview({ reply: data.reply, reason: data.reason });
        setNotice(data.reason ?? 'Review the supplier reply to import the contract.');
      } else {
        setNotice(data.reason ?? 'No contract found yet');
      }
      await refreshAction();
    } finally {
      setCheckingContract(false);
    }
  };

  const importSupplierReply = async (input: { url?: string | null; name?: string | null }) => {
    if (!replyReview || importingReply) return;
    setImportingReply(true);
    try {
      const res = await fetch(
        `/api/admin/contract-submit-actions/${action.id}/check-contract-reply`,
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
      const data = (await res.json()) as { error?: string; detected?: boolean };
      if (!res.ok) {
        setNotice(data.error ?? 'Import failed');
        return;
      }
      setReplyReview(null);
      setNotice('Supplier contract imported from email — ready to send to customer.');
      setActivityTick((n) => n + 1);
      await refreshAction();
    } finally {
      setImportingReply(false);
    }
  };

  const sendContractToCustomer = () => {
    launchAdminZohoCompose({
      to: action.customer_email || '',
      subject: buildCustomerContractEmailSubject(action),
      body: buildCustomerContractEmailBody(action, { snapshot: publishedSnapshot }),
      contextLabel: `${action.service_label} — customer contract`,
      contractSubmitActionId: action.id,
      contractSubmitIntent: 'customer',
    });
  };

  const replyToSupplier = () => {
    const to = action.supplier_contact_email?.trim() || '';
    if (!to) {
      setNotice('No supplier email on file — add one by resending or pasting into compose.');
    }
    launchAdminZohoCompose({
      to,
      subject: buildSupplierReplyEmailSubject(action),
      body: buildSupplierReplyEmailBody(action),
      contextLabel: `${action.vendor_name || action.service_label} — reply to supplier`,
      contractSubmitActionId: action.id,
      contractSubmitIntent: 'supplier_reply',
      supplierContactEmail: to || undefined,
      vendorName: action.vendor_name || undefined,
      providerId: action.provider_id || undefined,
    });
  };

  const accountLabel = dealAccountDisplayName(action);
  const contactLabel = dealContactDisplayName(action);

  const body = (
    <div className="contract-deal-workbench">
      {!asModal ? (
        <div className="contract-deal-workbench-header">
          <div>
            <div className="ticket-detail-field-label">Deal stage</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {CONTRACT_DEAL_STAGE_LABEL[action.status]}
            </div>
            <div style={{ fontSize: 13, color: 'var(--gray)', marginTop: 4 }}>
              {accountLabel}
              {contactLabel ? ` · Contact: ${contactLabel}` : ''}
              {action.vendor_name || action.service_label
                ? ` · ${action.vendor_name || action.service_label}`
                : ''}
              {action.pay_source ? ` · Pay source: ${action.pay_source}` : ''}
            </div>
          </div>
          {onClose ? (
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          ) : null}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 12 }}>
          {accountLabel}
          {contactLabel ? ` · Contact: ${contactLabel}` : ''}
          {action.vendor_name || action.service_label
            ? ` · ${action.vendor_name || action.service_label}`
            : ''}
          {action.pay_source ? ` · Pay source: ${action.pay_source}` : ''}
          <div style={{ marginTop: 4, fontWeight: 600, color: 'var(--gray-dark)' }}>
            {CONTRACT_DEAL_STAGE_LABEL[action.status]}
          </div>
        </div>
      )}

      <DealPipelineTimeline
        leadId={action.lead_id}
        actionId={action.id}
        customerExternalId={action.crm_customer_external_id}
        dealStage={action.status}
        compact
        interactive={false}
      />

      {latestSupplierEmail ? (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className="admin-ticket-btn"
            onClick={() => setEmailEvent(latestSupplierEmail)}
          >
            View email sent to supplier
          </button>
        </div>
      ) : null}

      {action.details ? (
        <div style={{ marginTop: 14 }}>
          <div className="ticket-detail-field-label">Customer notes</div>
          <p className="ticket-detail-message">{action.details}</p>
        </div>
      ) : null}

      {quotePackage ? (
        <div style={{ marginTop: 16 }}>
          <div className="ticket-detail-field-label" style={{ marginBottom: 8 }}>
            Accepted quote package
          </div>
          <AcceptedQuotePackageDetails pkg={quotePackage} />
        </div>
      ) : action.acceptance?.monthlyTotal != null ? (
        <div style={{ marginTop: 16, fontSize: 13 }}>
          Monthly ${action.acceptance.monthlyTotal.toFixed(2)}
          {action.acceptance.annualSavings != null
            ? ` · Est. annual savings $${action.acceptance.annualSavings.toFixed(2)}`
            : ''}
        </div>
      ) : null}

      <EditableContractLink
        action={action}
        onSaved={(next) => {
          setAction(next);
          setActivityTick((n) => n + 1);
          onUpdated?.();
        }}
      />

      {composePending ? (
        <p
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 8,
            background: '#FFFBEB',
            border: '1px solid #FDE68A',
            fontSize: 13,
            color: '#92400E',
          }}
        >
          Compose is open — click <strong>Send</strong> in the email window to advance this deal to
          “Supplier contract requested.”
        </p>
      ) : null}

      {action.status === 'supplier_contract_requested' ? (
        <p
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 8,
            background: '#ECFDF5',
            border: '1px solid #A7F3D0',
            fontSize: 13,
            color: '#065F46',
          }}
        >
          Submitted to supplier
          {action.supplier_contact_email ? ` (${action.supplier_contact_email})` : ''}.
          {action.pay_source ? ` Pay source: ${action.pay_source}.` : ''} Next: check for their
          contract reply.
        </p>
      ) : null}

      {notice ? (
        <p style={{ marginTop: 12, fontSize: 13, color: 'var(--gray-dark)' }}>{notice}</p>
      ) : null}

      {action.status !== 'converted' ? (
        <div className="contract-deal-workbench-actions">
          {(action.status === 'quote_accepted' ||
            action.status === 'supplier_contract_requested') && (
            <>
              {action.status === 'quote_accepted' ? (
                <button
                  type="button"
                  className="admin-ticket-btn primary"
                  onClick={() => setSupplierModalOpen(true)}
                >
                  Submit to supplier
                </button>
              ) : (
                <button
                  type="button"
                  className="admin-ticket-btn primary"
                  disabled={checkingContract}
                  onClick={() => void checkSupplierContract()}
                >
                  {checkingContract ? 'Checking…' : 'Check for supplier contract'}
                </button>
              )}
              {action.status === 'supplier_contract_requested' ? (
                <button
                  type="button"
                  className="admin-ticket-btn"
                  disabled={pipelineBusy}
                  onClick={() =>
                    void patchOp(
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
                {action.status === 'quote_accepted'
                  ? 'Preview supplier email'
                  : 'Resend to supplier'}
              </button>
            </>
          )}

          {(action.status === 'supplier_contract_received' ||
            action.status === 'customer_contract_sent') && (
            <>
              <button
                type="button"
                className="admin-ticket-btn primary"
                onClick={sendContractToCustomer}
              >
                {action.status === 'customer_contract_sent'
                  ? 'Resend contract to customer'
                  : 'Send contract to customer'}
              </button>
              <button type="button" className="admin-ticket-btn" onClick={replyToSupplier}>
                Reply to supplier
              </button>
            </>
          )}

          {action.status === 'customer_contract_signed' ? (
            <button type="button" className="admin-ticket-btn" onClick={replyToSupplier}>
              Reply to supplier
            </button>
          ) : null}

          {action.status === 'customer_contract_sent' ? (
            <button
              type="button"
              className="admin-ticket-btn"
              disabled={pipelineBusy}
              onClick={() => void patchOp('mark_signed', 'Marked customer contract as signed.')}
            >
              Mark contract signed
            </button>
          ) : null}

          {action.status === 'customer_contract_signed' ? (
            <button
              type="button"
              className="admin-ticket-btn primary"
              disabled={pipelineBusy}
              onClick={() =>
                void patchOp('convert', 'Lead converted — deal is now an active Candid service.')
              }
            >
              Convert to customer / activate service
            </button>
          ) : null}
        </div>
      ) : (
        <p style={{ marginTop: 14, fontSize: 13, color: 'var(--green, #0d9488)' }}>
          This deal is converted to an active Candid service.
        </p>
      )}

      {supplierModalOpen ? (
        <SubmitContractToSupplierModal
          action={action}
          onClose={() => setSupplierModalOpen(false)}
          onQueued={() => {
            setComposePending(true);
            setNotice('Compose opened — send the email to advance this deal.');
            setSupplierModalOpen(false);
          }}
        />
      ) : null}

      {emailEvent ? (
        <DealEmailPreviewModal event={emailEvent} onClose={() => setEmailEvent(null)} />
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
    </div>
  );

  if (!asModal) return body;

  return (
    <div className="modal-overlay open" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contract-deal-workbench-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720, maxHeight: '90vh', overflow: 'auto' }}
      >
        <div className="modal-header">
          <h3 id="contract-deal-workbench-title">Contract deal</h3>
          {onClose ? (
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          ) : null}
        </div>
        <div className="modal-body">{body}</div>
      </div>
    </div>
  );
}
