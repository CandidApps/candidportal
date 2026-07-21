'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { QuoteRequestRow } from '@/lib/services/quote-requests';
import {
  dedupeQuoteRequirementAnswers,
  extractCustomerAdditionalNotes,
  formatQuoteRequestTime,
  patchQuoteRequest,
  resolveQuoteServiceLabel,
} from '@/lib/services/quote-requests';
import type { PublishedQuoteSnapshot, QuoteSupplierRfqRow } from '@/lib/quotes/types';
import type { Lead } from '@/components/LeadsView';
import { patchPortalLead } from '@/lib/services/portal-leads';
import { detectQuoteServiceTypeId } from '@/lib/quotes/quote-request-analysis';
import { mergeQuoteItemsIntoSnapshot, quoteItemsFromSnapshot } from '@/lib/quotes/quote-items';
import { QuoteRequestQuotesPanel } from '@/components/admin/QuoteRequestQuotesPanel';
import { ActionWorkBar } from '@/components/admin/ActionWorkBar';
import { PhoneLink } from '@/components/shared/PhoneLink';
import { TeamNotesPanel } from '@/components/admin/TeamNotesPanel';
import { buildActionKey } from '@/lib/admin-action-work';
import { launchAdminZohoCompose } from '@/lib/email/admin-compose';
import { launchQuoteReadyCustomerEmail, resolveQuoteCustomerEmail } from '@/lib/quotes/quote-customer-email';
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
  linkedLead = null,
  onConvertLead,
  onOpenLeads,
  onRefreshLeads,
  onViewPublishedQuoteAsCustomer,
}: {
  quoteRequestId: string;
  onClose: () => void;
  onUpdated?: () => void;
  currentUserId?: string;
  onActionWorkUpdated?: () => void;
  assignees?: import('@/lib/admin-action-work').ActionAssignee[];
  linkedLead?: Lead | null;
  onConvertLead?: (lead: Lead) => void;
  onOpenLeads?: () => void;
  onRefreshLeads?: () => void | Promise<void>;
  onViewPublishedQuoteAsCustomer?: (
    quoteRequestId: string,
    contact?: { name?: string; email?: string },
  ) => void;
}) {
  const [row, setRow] = useState<QuoteRequestRow | null>(null);
  const [rfqs, setRfqs] = useState<QuoteSupplierRfqRow[]>([]);
  const [draft, setDraft] = useState<PublishedQuoteSnapshot | null>(null);
  const [adminMessage, setAdminMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [closeLeadOpen, setCloseLeadOpen] = useState(false);
  const [closeReason, setCloseReason] = useState<'lost' | 'duplicate' | 'spam' | 'other'>('lost');
  const [closeNote, setCloseNote] = useState('');

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
      const detectedId = req ? detectQuoteServiceTypeId(req) : null;
      setDraft(
        snap ?? {
          serviceTypeId: req?.service_type_id ?? detectedId,
          serviceLabel: req ? resolveQuoteServiceLabel(req) : '',
          quotePath: (req?.service_type_id ?? detectedId) === 'ucaas' ? 'instant_ucaas' : 'manual',
          adminMessage: '',
        },
      );
      setAdminMessage(snap?.adminMessage ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [quoteRequestId]);

  useEffect(() => {
    void load();
  }, [load]);

  const customerEmail = useMemo(
    () => (row ? resolveQuoteCustomerEmail(row, linkedLead) : null),
    [row, linkedLead],
  );

  const buildDraftPayload = useMemo((): PublishedQuoteSnapshot | null => {
    if (!row || !draft) return null;
    const items = quoteItemsFromSnapshot(draft);
    const merged = mergeQuoteItemsIntoSnapshot(
      {
        ...draft,
        adminMessage: adminMessage.trim() || undefined,
      },
      items,
    );
    return merged;
  }, [row, draft, adminMessage]);

  const saveDraft = async () => {
    if (!buildDraftPayload) return;
    setSaving(true);
    setError('');
    try {
      const updated = await patchQuoteRequest(quoteRequestId, {
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
        draftQuoteSnapshot: buildDraftPayload,
        publish: true,
      });
      if (!updated) throw new Error('Publish failed');
      setRow(updated);
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setSaving(false);
    }
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
  const categoryId = quoteServiceCategoryId(row.service_type_id ?? draft?.serviceTypeId);

  const openCustomerQuoteView = () => {
    if (!onViewPublishedQuoteAsCustomer || !published) return;
    onViewPublishedQuoteAsCustomer(quoteRequestId, {
      name: row.contact_name?.trim() || undefined,
      email: row.contact_email?.trim() || undefined,
    });
  };

  const openQuoteReadyEmail = () => {
    if (!published) return;
    launchQuoteReadyCustomerEmail({ row, linkedLead });
  };

  const publishedEmailActions = published ? (
    <>
      {onViewPublishedQuoteAsCustomer ? (
        <button type="button" className="btn-primary" onClick={openCustomerQuoteView}>
          View as customer
        </button>
      ) : null}
      <button
        type="button"
        className="btn-secondary"
        disabled={!customerEmail}
        title={!customerEmail ? 'Add a customer email on the quote or lead contact' : undefined}
        onClick={openQuoteReadyEmail}
      >
        Email customer
      </button>
    </>
  ) : null;

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
          {published ? (
            publishedEmailActions
          ) : row.contact_email ? (
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

      {row.customer_accepted_at ? (
        <div className="msp-callout msp-callout--info" style={{ marginBottom: 16, textAlign: 'left' }}>
          <strong>Customer accepted this quote</strong>
          {' · '}
          {new Date(row.customer_accepted_at).toLocaleString()}
          {row.customer_acceptance?.details ? (
            <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
              Details: {row.customer_acceptance.details}
            </div>
          ) : null}
          {row.customer_acceptance?.monthlyTotal != null ? (
            <div style={{ marginTop: 4, fontSize: 13 }}>
              Selected monthly ~${row.customer_acceptance.monthlyTotal.toFixed(2)}
              {row.customer_acceptance.annualSavings != null
                ? ` · Est. annual savings ~$${row.customer_acceptance.annualSavings.toFixed(2)}`
                : ''}
            </div>
          ) : null}
        </div>
      ) : null}

      <ActionWorkBar
        actionKind="quote_request"
        sourceId={row.id}
        assignees={assignees}
        currentUserId={currentUserId}
        onUpdated={onActionWorkUpdated}
      />

      {linkedLead ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div className="card-title">Linked lead</div>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray)' }}>
              {linkedLead.lifecycle === 'converted'
                ? 'Converted'
                : linkedLead.lifecycle === 'closed'
                  ? `Closed — ${linkedLead.closeReason ?? 'other'}`
                  : 'Open'}
            </span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{linkedLead.companyFriendly}</div>
              <div style={{ fontSize: 12, color: 'var(--gray)' }}>{linkedLead.helpWith}</div>
            </div>
            {onOpenLeads ? (
              <button type="button" className="btn-secondary" onClick={onOpenLeads}>
                Open in Leads
              </button>
            ) : null}
            {linkedLead.lifecycle !== 'closed' && linkedLead.lifecycle !== 'converted' && onConvertLead ? (
              <button type="button" className="btn-primary" onClick={() => onConvertLead(linkedLead)}>
                Convert to account
              </button>
            ) : null}
            {linkedLead.lifecycle !== 'closed' && linkedLead.lifecycle !== 'converted' ? (
              <button type="button" className="btn-secondary" onClick={() => setCloseLeadOpen(true)}>
                Close lead
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {closeLeadOpen && linkedLead?.portalLeadRowId ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">Close linked lead</div>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Reason</label>
            <select
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value as typeof closeReason)}
              className="nq-input"
            >
              <option value="lost">Lost</option>
              <option value="duplicate">Duplicate</option>
              <option value="spam">Spam</option>
              <option value="other">Other</option>
            </select>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Note (optional)</label>
            <textarea
              value={closeNote}
              onChange={(e) => setCloseNote(e.target.value)}
              className="nq-input nq-textarea"
              rows={2}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn-secondary" onClick={() => setCloseLeadOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  void (async () => {
                    const next: Lead = {
                      ...linkedLead,
                      lifecycle: 'closed',
                      closeReason,
                      closeNote: closeNote.trim() || undefined,
                      status: 'inactive',
                    };
                    await patchPortalLead(linkedLead.portalLeadRowId!, {
                      lifecycle: 'closed',
                      closeReason,
                      closeNote: closeNote.trim() || undefined,
                      leadData: next,
                    });
                    setCloseLeadOpen(false);
                    await onRefreshLeads?.();
                  })();
                }}
              >
                Close lead
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
                {isDisplayableText(row.contact_phone) ? <PhoneLink phone={row.contact_phone} /> : null}
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

      {!published ? (
        <>
          <QuoteRequestQuotesPanel
            row={row}
            draft={draft}
            onDraftChange={setDraft}
            rfqs={rfqs}
            onRfqsRefresh={() => void load()}
            disabled={saving}
          />

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <div className="card-title">Customer message</div>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label>Message to customer (included with published quote)</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  value={adminMessage}
                  onChange={(e) => setAdminMessage(e.target.value)}
                  placeholder="Optional note included when you publish…"
                />
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div className="card-title">Published to customer</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{publishedEmailActions}</div>
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

      {published ? (
        <div className="analysis-review-footer" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {publishedEmailActions}
        </div>
      ) : null}
    </div>
  );
}
