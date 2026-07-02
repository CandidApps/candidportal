'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { QuoteRequestRow } from '@/lib/services/quote-requests';
import {
  dedupeQuoteRequirementAnswers,
  extractCustomerAdditionalNotes,
  formatQuoteRequestTime,
  patchQuoteRequest,
  quoteHasBuiltInPricingPath,
  resolveQuoteServiceLabel,
} from '@/lib/services/quote-requests';
import type { PublishedQuoteSnapshot, QuoteSupplierRfqRow } from '@/lib/quotes/types';
import type { UcaasQuoteSnapshot } from '@/lib/ucaas/types';
import { UcaasQuoteBuilder } from '@/components/admin/UcaasQuoteBuilder';
import { QuoteRequestAiSuggestions } from '@/components/admin/QuoteRequestAiSuggestions';
import { SubmitToSupplierModal } from '@/components/admin/SubmitToSupplierModal';
import { ActionWorkBar } from '@/components/admin/ActionWorkBar';
import { TeamNotesPanel } from '@/components/admin/TeamNotesPanel';
import { buildActionKey } from '@/lib/admin-action-work';
import { launchAdminZohoCompose } from '@/lib/email/admin-compose';
import { quoteServiceCategoryId } from '@/lib/quotes/supplier-filter';

function DetailLabel({ children }: { children: React.ReactNode }) {
  return <div className="ticket-detail-field-label">{children}</div>;
}

function DetailValue({
  children,
  prominent,
  secondary,
}: {
  children: React.ReactNode;
  prominent?: boolean;
  secondary?: boolean;
}) {
  return (
    <div
      className={[
        'quote-request-detail-value',
        prominent ? 'quote-request-detail-value--prominent' : '',
        secondary ? 'quote-request-detail-value--secondary' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}

function DetailField({
  label,
  children,
  prominent,
  secondary,
}: {
  label: string;
  children: React.ReactNode;
  prominent?: boolean;
  secondary?: boolean;
}) {
  if (children == null || children === '') return null;
  return (
    <div className="quote-request-detail-field">
      <DetailLabel>{label}</DetailLabel>
      <DetailValue prominent={prominent} secondary={secondary}>
        {children}
      </DetailValue>
    </div>
  );
}

function formatLocation(row: QuoteRequestRow): string | null {
  const parts = [
    row.location?.label,
    row.location?.street,
    row.location?.city,
    row.location?.state,
    row.location?.zip,
  ]
    .map((p) => p?.trim())
    .filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function isDisplayableText(value: string | null | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  if (trimmed.length < 2) return false;
  if (/^[a-z]{1,4}$/i.test(trimmed) && !/\s/.test(trimmed)) return false;
  return true;
}

export function QuoteRequestDetailPanel({
  quoteRequestId,
  onClose,
  onUpdated,
  currentUserId,
  onActionWorkUpdated,
  assignees,
}: {
  quoteRequestId: string;
  onClose: () => void;
  onUpdated?: () => void;
  currentUserId?: string;
  onActionWorkUpdated?: () => void;
  assignees?: import('@/lib/admin-action-work').ActionAssignee[];
}) {
  const [row, setRow] = useState<QuoteRequestRow | null>(null);
  const [rfqs, setRfqs] = useState<QuoteSupplierRfqRow[]>([]);
  const [draft, setDraft] = useState<PublishedQuoteSnapshot | null>(null);
  const [adminMessage, setAdminMessage] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [proposalUrl, setProposalUrl] = useState('');
  const [proposalName, setProposalName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const quoteDeliverableRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/quote-requests/${quoteRequestId}`);
      const data = (await res.json()) as {
        request?: QuoteRequestRow;
        supplierRfqs?: QuoteSupplierRfqRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load quote request');
      const req = data.request ?? null;
      setRow(req);
      setRfqs((data.supplierRfqs ?? []) as QuoteSupplierRfqRow[]);
      const snap = req?.draft_quote_snapshot ?? req?.published_quote_snapshot ?? null;
      setDraft(
        snap ?? {
          serviceTypeId: req?.service_type_id ?? null,
          serviceLabel: req ? resolveQuoteServiceLabel(req) : '',
          quotePath: req?.service_type_id === 'ucaas' ? 'instant_ucaas' : 'manual',
          adminMessage: '',
        },
      );
      setAdminMessage(snap?.adminMessage ?? '');
      setAdminNotes(req?.admin_notes ?? '');
      setProposalUrl(snap?.proposalDocument?.url ?? '');
      setProposalName(snap?.proposalDocument?.name ?? 'Supplier quote.pdf');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [quoteRequestId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isUcaas = row?.service_type_id === 'ucaas';
  const categoryId = quoteServiceCategoryId(row?.service_type_id);

  const buildDraftPayload = useMemo((): PublishedQuoteSnapshot | null => {
    if (!row) return null;
    const base: PublishedQuoteSnapshot = {
      serviceTypeId: row.service_type_id,
      serviceLabel: resolveQuoteServiceLabel(row),
      adminMessage: adminMessage.trim() || undefined,
      quotePath: isUcaas && draft?.ucaasQuote ? 'instant_ucaas' : proposalUrl.trim() ? 'proposal' : 'manual',
      ucaasQuote: draft?.ucaasQuote,
      proposalDocument: proposalUrl.trim()
        ? { url: proposalUrl.trim(), name: proposalName.trim() || 'Quote proposal.pdf' }
        : undefined,
    };
    return base;
  }, [row, adminMessage, isUcaas, draft?.ucaasQuote, proposalUrl, proposalName]);

  const saveDraft = async () => {
    if (!buildDraftPayload) return;
    setSaving(true);
    setError('');
    try {
      const updated = await patchQuoteRequest(quoteRequestId, {
        adminNotes,
        draftQuoteSnapshot: buildDraftPayload,
        status: row?.status === 'open' ? 'in_progress' : undefined,
      });
      if (!updated) throw new Error('Save failed');
      setRow(updated);
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!buildDraftPayload) return;
    setSaving(true);
    setError('');
    try {
      const updated = await patchQuoteRequest(quoteRequestId, {
        adminNotes,
        draftQuoteSnapshot: buildDraftPayload,
        publish: true,
      });
      if (!updated) throw new Error('Publish failed');
      setRow(updated);
      onUpdated?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setSaving(false);
    }
  };

  const onUcaasChange = (next: UcaasQuoteSnapshot) => {
    setDraft((prev) => ({
      ...(prev ?? {
        serviceTypeId: row?.service_type_id ?? null,
        serviceLabel: row ? resolveQuoteServiceLabel(row) : '',
        quotePath: 'instant_ucaas',
      }),
      ucaasQuote: next,
      quotePath: 'instant_ucaas',
    }));
  };

  if (loading) {
    return (
      <div className="analysis-review-panel">
        <p>Loading quote request…</p>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="analysis-review-panel">
        <p>{error || 'Quote request not found.'}</p>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    );
  }

  const published = row ? Boolean(row.published_quote_snapshot) : false;
  const additionalNotes = row ? extractCustomerAdditionalNotes(row) : [];
  const requirementAnswers = row ? dedupeQuoteRequirementAnswers(row) : [];
  const locationText = formatLocation(row);
  const showAiSuggestions = !published && !quoteHasBuiltInPricingPath(row);

  const closeAsSpam = async () => {
    setSaving(true);
    setError('');
    try {
      const updated = await patchQuoteRequest(quoteRequestId, { status: 'resolved' });
      if (!updated) throw new Error('Could not close request');
      setRow(updated);
      onUpdated?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not close request');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="analysis-review-panel quote-request-panel">
      <div className="analysis-review-panel-header">
        <div>
          <div className="analysis-review-eyebrow">Quote request</div>
          <h2 className="analysis-review-title">{row.subject ?? resolveQuoteServiceLabel(row)}</h2>
          <div className="analysis-review-meta">
            {row.company ?? row.contact_name ?? 'Customer'} · {formatQuoteRequestTime(row.created_at)} ·{' '}
            {row.status.replace('_', ' ')}
            {categoryId ? ` · ${categoryId}` : ''}
          </div>
        </div>
        <div className="analysis-review-header-actions">
          {row.contact_email ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                launchAdminZohoCompose({
                  to: row.contact_email!,
                  subject: row.subject ?? 'Your Candid quote',
                  contextLabel: row.company ?? row.contact_name ?? 'Customer',
                })
              }
            >
              Email customer
            </button>
          ) : null}
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <ActionWorkBar
        actionKind="quote_request"
        sourceId={row.id}
        assignees={assignees}
        currentUserId={currentUserId}
        onUpdated={onActionWorkUpdated}
      />

      <div className="card quote-request-details-card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">Request details</div>
        </div>
        <div className="card-body quote-request-details-body">
          <section className="quote-request-detail-group">
            <div className="quote-request-detail-group-heading">Who</div>
            <div className="quote-request-detail-group-grid">
              <DetailField label="Company" prominent>
                {isDisplayableText(row.company) ? row.company : null}
              </DetailField>
              <DetailField label="Contact" secondary>
                {isDisplayableText(row.contact_name) ? row.contact_name : null}
              </DetailField>
              <DetailField label="Email">
                {isDisplayableText(row.contact_email) ? row.contact_email : null}
              </DetailField>
              <DetailField label="Phone">
                {isDisplayableText(row.contact_phone) ? row.contact_phone : null}
              </DetailField>
            </div>
          </section>

          <section className="quote-request-detail-group">
            <div className="quote-request-detail-group-heading">What</div>
            <div className="quote-request-detail-group-grid">
              <DetailField label="Service">
                {resolveQuoteServiceLabel(row)}
              </DetailField>
              <DetailField label="Mode">
                {row.mode === 'add-services' ? 'Add services / users' : 'New quote'}
              </DetailField>
              <DetailField label="Location">{locationText}</DetailField>
              {row.vendor_names?.length ? (
                <DetailField label="Vendors">{row.vendor_names.join(', ')}</DetailField>
              ) : null}
            </div>
          </section>

          {requirementAnswers.length ? (
            <section className="quote-request-detail-group">
              <div className="quote-request-detail-group-heading">Requirements</div>
              <div className="quote-request-detail-group-grid">
                {requirementAnswers.map((a) => (
                  <DetailField key={a.label} label={a.label}>
                    {isDisplayableText(a.value) ? a.value : null}
                  </DetailField>
                ))}
              </div>
            </section>
          ) : null}

          {additionalNotes.length ? (
            <section className="quote-request-detail-group quote-request-additional-notes-section">
              <div className="quote-request-detail-group-heading">Additional from customer</div>
              <div className="quote-request-additional-notes-list">
                {additionalNotes.map((paragraph, index) => (
                  <div key={index} className="quote-request-additional-note">
                    <p>{paragraph}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {showAiSuggestions ? (
        <QuoteRequestAiSuggestions
          quoteRequestId={row.id}
          contactEmail={row.contact_email}
          customerLabel={row.company ?? row.contact_name ?? undefined}
          onSubmitToSupplier={() => setShowSupplierModal(true)}
          onGenerateQuote={() =>
            quoteDeliverableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
          onCloseAsSpam={() => void closeAsSpam()}
          onEmailCustomer={(draft) => {
            if (!row.contact_email) return;
            launchAdminZohoCompose({
              to: row.contact_email,
              subject: row.subject ?? 'Your Candid quote request',
              body: draft,
              contextLabel: row.company ?? row.contact_name ?? 'Customer',
            });
          }}
        />
      ) : null}

      {!published ? (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <div className="card-title">Supplier RFQ</div>
            </div>
            <div className="card-body">
              <p className="text-muted" style={{ marginBottom: 12 }}>
                When instant pricing is unavailable, send the standardized request details to filtered suppliers
                (separate email per supplier).
              </p>
              <button type="button" className="btn-primary" onClick={() => setShowSupplierModal(true)}>
                Submit to supplier
              </button>
              {rfqs.length ? (
                <ul className="supplier-rfq-log" style={{ marginTop: 16 }}>
                  {rfqs.map((r) => (
                    <li key={r.id}>
                      {r.provider_name} → {r.contact_email} · {formatQuoteRequestTime(r.sent_at)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          <div className="card" ref={quoteDeliverableRef} style={{ marginBottom: 16 }}>
            <div className="card-header">
              <div className="card-title">Quote deliverable</div>
            </div>
            <div className="card-body">
              {isUcaas ? (
                <UcaasQuoteBuilder
                  value={draft?.ucaasQuote}
                  onChange={onUcaasChange}
                  onRemove={() =>
                    setDraft((d) => (d ? { ...d, ucaasQuote: undefined, quotePath: 'manual' } : d))
                  }
                />
              ) : (
                <>
                  <p className="text-muted" style={{ marginBottom: 12 }}>
                    Paste a supplier quote PDF URL or upload link after you receive pricing.
                  </p>
                  <div className="form-group">
                    <label>Proposal / quote document URL</label>
                    <input
                      className="form-input"
                      value={proposalUrl}
                      onChange={(e) => setProposalUrl(e.target.value)}
                      placeholder="https://…"
                    />
                  </div>
                  <div className="form-group">
                    <label>Document name</label>
                    <input
                      className="form-input"
                      value={proposalName}
                      onChange={(e) => setProposalName(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="form-group" style={{ marginTop: 16 }}>
                <label>Message to customer (included with published quote)</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  value={adminMessage}
                  onChange={(e) => setAdminMessage(e.target.value)}
                  placeholder="Optional note included when you publish…"
                />
              </div>

              <div className="form-group">
                <label>Internal admin notes</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                />
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">Published to customer</div>
          </div>
          <div className="card-body">
            <p>
              Published {row.published_at ? formatQuoteRequestTime(row.published_at) : ''}. The customer can view this
              quote from their Alerts bell.
            </p>
            {row.published_quote_snapshot?.adminMessage ? (
              <p className="ticket-detail-message">{row.published_quote_snapshot.adminMessage}</p>
            ) : null}
          </div>
        </div>
      )}

      <TeamNotesPanel
        contextType="action"
        contextKey={buildActionKey('quote_request', row.id)}
        title="Team notes on this quote"
      />

      {!published ? (
        <div className="analysis-review-footer">
          <button type="button" className="btn-secondary" onClick={() => void saveDraft()} disabled={saving}>
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          <button type="button" className="btn-primary" onClick={() => void publish()} disabled={saving}>
            {saving ? 'Publishing…' : 'Publish to customer'}
          </button>
        </div>
      ) : null}

      {showSupplierModal ? (
        <SubmitToSupplierModal
          quoteRequest={row}
          onClose={() => setShowSupplierModal(false)}
          onSubmitted={() => void load()}
        />
      ) : null}
    </div>
  );
}
