'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { QuoteRequestPricingSection } from '@/components/admin/QuoteRequestPricingSection';
import { QuoteSupplierRequestPicker } from '@/components/admin/QuoteSupplierRequestPicker';
import {
  ADMIN_COMPOSE_SENT_EVENT,
  launchAdminZohoCompose,
  type AdminComposeSentDetail,
} from '@/lib/email/admin-compose';
import { buildRfqEmailBody, buildRfqEmailSubject } from '@/lib/quotes/rfq-template';
import {
  createQuoteItem,
  mergeQuoteItemsIntoSnapshot,
  quoteItemsFromSnapshot,
  removeQuoteItem,
  updateQuoteItem,
} from '@/lib/quotes/quote-items';
import type {
  PublishedQuoteSnapshot,
  QuoteItemKind,
  QuoteProposalDocument,
  QuoteRequestItem,
  QuoteSupplierRfqRow,
} from '@/lib/quotes/types';
import type { QuoteRequestRow } from '@/lib/services/quote-requests';
import { formatQuoteRequestTime, resolveQuoteServiceLabel } from '@/lib/services/quote-requests';
import { DocumentEmbed } from '@/components/admin/DocumentEmbed';

const KIND_LABELS: Record<QuoteItemKind, string> = {
  manual: 'Manual quote',
  upload: 'Upload quote',
  supplier_request: 'Request from supplier',
};

function itemToDraft(item: QuoteRequestItem, base: PublishedQuoteSnapshot | null): PublishedQuoteSnapshot {
  return {
    serviceTypeId: item.serviceTypeId ?? base?.serviceTypeId ?? null,
    serviceLabel: base?.serviceLabel ?? '',
    quotePath: base?.quotePath ?? 'manual',
    categories: item.categories ?? base?.categories,
    matchedProviderSlug: item.matchedProviderSlug,
    matchedProviderName: item.matchedProviderName,
    ourRateLines: item.ourRateLines,
    pricingStructureOptions: item.pricingStructureOptions,
    selectedPricingStructures: item.selectedPricingStructures,
    dualPricingCustomerFeePct: item.dualPricingCustomerFeePct,
    showSupplierName: item.showSupplierName,
    ucaasQuote: item.ucaasQuote,
    proposalDocument: item.proposalDocument,
    internetQuote: item.internetQuote ?? base?.internetQuote,
    merchantQuote: item.merchantQuote ?? base?.merchantQuote,
  };
}

function draftToItemPatch(draft: PublishedQuoteSnapshot): Partial<QuoteRequestItem> {
  return {
    serviceTypeId: draft.serviceTypeId,
    categories: draft.categories,
    matchedProviderSlug: draft.matchedProviderSlug,
    matchedProviderName: draft.matchedProviderName,
    ourRateLines: draft.ourRateLines,
    pricingStructureOptions: draft.pricingStructureOptions,
    selectedPricingStructures: draft.selectedPricingStructures,
    dualPricingCustomerFeePct: draft.dualPricingCustomerFeePct,
    showSupplierName: draft.showSupplierName,
    ucaasQuote: draft.ucaasQuote,
    proposalDocument: draft.proposalDocument,
    internetQuote: draft.internetQuote,
    merchantQuote: draft.merchantQuote,
    label: draft.matchedProviderName ? `Manual — ${draft.matchedProviderName}` : undefined,
  };
}

function rfqForItem(item: QuoteRequestItem, rfqs: QuoteSupplierRfqRow[]): QuoteSupplierRfqRow | undefined {
  if (item.supplierRfqId) return rfqs.find((r) => r.id === item.supplierRfqId);
  return rfqs.find((r) => r.quote_item_id === item.id);
}

export function QuoteRequestQuotesPanel({
  row,
  draft,
  onDraftChange,
  rfqs,
  onRfqsRefresh,
  disabled = false,
}: {
  row: QuoteRequestRow;
  draft: PublishedQuoteSnapshot | null;
  onDraftChange: (next: PublishedQuoteSnapshot) => void;
  rfqs: QuoteSupplierRfqRow[];
  onRfqsRefresh: () => void;
  disabled?: boolean;
}) {
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [checkingResponses, setCheckingResponses] = useState(false);
  const [uploadBusy, setUploadBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const quoteItems = useMemo(() => quoteItemsFromSnapshot(draft), [draft]);

  const setItems = useCallback(
    (items: QuoteRequestItem[]) => {
      const base: PublishedQuoteSnapshot = draft ?? {
        serviceTypeId: row.service_type_id,
        serviceLabel: resolveQuoteServiceLabel(row),
        quotePath: 'manual',
      };
      onDraftChange(mergeQuoteItemsIntoSnapshot(base, items));
    },
    [draft, onDraftChange, row],
  );

  const addItem = (kind: QuoteItemKind) => {
    if (kind === 'supplier_request') {
      setShowSupplierPicker(true);
      return;
    }
    setItems([...quoteItems, createQuoteItem(kind)]);
  };

  const patchItem = (id: string, patch: Partial<QuoteRequestItem>) => {
    setItems(updateQuoteItem(quoteItems, id, patch));
  };

  const removeItem = (id: string) => {
    setItems(removeQuoteItem(quoteItems, id));
  };

  useEffect(() => {
    const onSent = (e: Event) => {
      const detail = (e as CustomEvent<AdminComposeSentDetail>).detail;
      if (!detail.quoteRequestId || detail.quoteRequestId !== row.id || !detail.quoteItemId) return;
      onDraftChange(
        mergeQuoteItemsIntoSnapshot(draft ?? {
          serviceTypeId: row.service_type_id,
          serviceLabel: resolveQuoteServiceLabel(row),
          quotePath: 'manual',
        }, updateQuoteItem(quoteItemsFromSnapshot(draft), detail.quoteItemId, {
          rfqStatus: 'sent',
          sentAt: new Date().toISOString(),
          supplierRfqId: detail.rfqId,
        })),
      );
      onRfqsRefresh();
    };
    window.addEventListener(ADMIN_COMPOSE_SENT_EVENT, onSent);
    return () => window.removeEventListener(ADMIN_COMPOSE_SENT_EVENT, onSent);
  }, [row.id, row.service_type_id, draft, onDraftChange, onRfqsRefresh]);

  const checkResponses = async () => {
    setCheckingResponses(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/quote-requests/${row.id}/supplier-rfqs/check-responses`, {
        method: 'POST',
      });
      const data = (await res.json()) as {
        detected?: Array<{ rfqId: string; quoteItemId?: string; quote: QuoteProposalDocument }>;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Check failed');
      if (data.detected?.length) {
        let next = [...quoteItems];
        for (const hit of data.detected) {
          if (!hit.quoteItemId) continue;
          next = updateQuoteItem(next, hit.quoteItemId, {
            rfqStatus: 'responded',
            respondedAt: new Date().toISOString(),
            responseQuote: hit.quote as QuoteProposalDocument,
            responseSource: hit.quote.url ? 'link' : hit.quote.excerpt ? 'body' : 'attachment',
          });
        }
        setItems(next);
      }
      onRfqsRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check responses');
    } finally {
      setCheckingResponses(false);
    }
  };

  const uploadFile = async (itemId: string, file: File) => {
    setUploadBusy(itemId);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('quoteItemId', itemId);
      const res = await fetch(`/api/admin/quote-requests/${row.id}/proposal`, {
        method: 'POST',
        body: form,
      });
      const data = (await res.json()) as { proposalDocument?: QuoteProposalDocument; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      patchItem(itemId, {
        proposalDocument: data.proposalDocument,
        label: data.proposalDocument?.name ?? 'Uploaded quote',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadBusy(null);
    }
  };

  const importSupplierResponse = (item: QuoteRequestItem) => {
    const rfq = rfqForItem(item, rfqs);
    const response = item.responseQuote ?? (rfq?.response_quote as QuoteProposalDocument | undefined);
    if (!response) return;
    setItems([
      ...quoteItems,
      createQuoteItem('upload', {
        proposalDocument: response,
        label: `From ${item.providerName ?? 'supplier'}`,
      }),
    ]);
  };

  const resendSupplier = (item: QuoteRequestItem) => {
    const rfq = rfqForItem(item, rfqs);
    if (!item.contactEmail) return;
    const subject = rfq?.rfq_subject ?? buildRfqEmailSubject(row);
    const body = rfq?.email_body ?? buildRfqEmailBody(row);
    launchAdminZohoCompose({
      to: item.contactEmail,
      subject,
      body,
      contextLabel: `${item.providerName ?? 'Supplier'} — RFQ`,
      rfqId: rfq?.id ?? item.supplierRfqId,
      quoteRequestId: row.id,
      quoteItemId: item.id,
    });
  };

  const sentRfqs = rfqs.filter((r) => r.status === 'sent' || r.status === 'responded');

  return (
    <div className="quote-request-quotes-panel">
      {sentRfqs.length ? (
        <div className="card quote-supplier-emails-card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">Supplier emails</div>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={checkingResponses}
              onClick={() => void checkResponses()}
            >
              {checkingResponses ? 'Checking…' : 'Check for responses'}
            </button>
          </div>
          <div className="card-body">
            <ul className="quote-supplier-email-list">
              {sentRfqs.map((r) => (
                <li key={r.id} className={`quote-supplier-email-row quote-supplier-email-row--${r.status}`}>
                  <div className="quote-supplier-email-main">
                    <strong>{r.provider_name}</strong>
                    <span className="quote-supplier-email-to">→ {r.contact_email}</span>
                  </div>
                  <div className="quote-supplier-email-meta">
                    Sent {formatQuoteRequestTime(r.sent_at)}
                    {r.status === 'responded' && r.responded_at
                      ? ` · Response ${formatQuoteRequestTime(r.responded_at)}`
                      : ''}
                    {r.response_source ? ` · via ${r.response_source}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">Quotes for customer</div>
          <div className="quote-type-add-row">
            <button type="button" className="btn-secondary btn-sm" disabled={disabled} onClick={() => addItem('manual')}>
              + Manual quote
            </button>
            <button type="button" className="btn-secondary btn-sm" disabled={disabled} onClick={() => addItem('upload')}>
              + Upload quote
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={disabled}
              onClick={() => addItem('supplier_request')}
            >
              + Request from supplier
            </button>
          </div>
        </div>
        <div className="card-body">
          <p className="text-muted" style={{ marginTop: 0 }}>
            Add one or more quotes — manual (Schedule A / instant pricing), uploaded documents, or supplier
            requests. You can combine types on the same request.
          </p>

          {error ? <p className="form-error">{error}</p> : null}

          {!quoteItems.length ? (
            <p className="text-muted">No quotes yet. Add a manual quote, upload, or request pricing from a supplier.</p>
          ) : null}

          <div className="quote-items-stack">
            {quoteItems.map((item, index) => {
              const rfq = rfqForItem(item, rfqs);
              const status = item.rfqStatus ?? rfq?.status;
              return (
                <article key={item.id} className="quote-item-card">
                  <header className="quote-item-card-header">
                    <div>
                      <span className="quote-item-kind">{KIND_LABELS[item.kind]}</span>
                      <strong className="quote-item-title">{item.label ?? `Quote ${index + 1}`}</strong>
                    </div>
                    <button
                      type="button"
                      className="quote-item-remove"
                      disabled={disabled}
                      onClick={() => removeItem(item.id)}
                      aria-label="Remove quote"
                    >
                      <AppIcon name="close" size={13} />
                    </button>
                  </header>

                  {item.kind === 'manual' ? (
                    <div className="quote-item-pricing-embedded">
                      <QuoteRequestPricingSection
                      row={row}
                      draft={itemToDraft(item, draft)}
                      onDraftChange={(next) => patchItem(item.id, draftToItemPatch(next))}
                      proposalUrl={item.proposalDocument?.url ?? ''}
                      proposalName={item.proposalDocument?.name ?? ''}
                      onProposalUrlChange={(url) =>
                        patchItem(item.id, {
                          proposalDocument: { ...item.proposalDocument, url, name: item.proposalDocument?.name ?? 'Quote.pdf' },
                        })
                      }
                      onProposalNameChange={(name) =>
                        patchItem(item.id, {
                          proposalDocument: { ...item.proposalDocument, name, url: item.proposalDocument?.url },
                        })
                      }
                      disabled={disabled}
                    />
                    </div>
                  ) : null}

                  {item.kind === 'upload' ? (
                    <div className="quote-item-upload-body">
                      <label className="form-group">
                        <span className="form-label">Upload quote document</span>
                        <input
                          className="form-input"
                          type="file"
                          accept=".pdf,.doc,.docx,.xlsx,.png,.jpg,.jpeg,.webp"
                          disabled={disabled || uploadBusy === item.id}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void uploadFile(item.id, file);
                          }}
                        />
                      </label>
                      {item.proposalDocument?.url ? (
                        <DocumentEmbed
                          url={item.proposalDocument.url}
                          title={item.proposalDocument.name}
                          filename={item.proposalDocument.name}
                          mimeType={item.proposalDocument.mimeType}
                        />
                      ) : (
                        <p className="text-muted">Or paste a URL below.</p>
                      )}
                      <label className="form-group">
                        <span className="form-label">Document URL</span>
                        <input
                          className="form-input"
                          value={item.proposalDocument?.url ?? ''}
                          disabled={disabled}
                          onChange={(e) =>
                            patchItem(item.id, {
                              proposalDocument: {
                                name: item.proposalDocument?.name ?? 'Quote.pdf',
                                url: e.target.value,
                              },
                            })
                          }
                          placeholder="https://…"
                        />
                      </label>
                    </div>
                  ) : null}

                  {item.kind === 'supplier_request' ? (
                    <div className="quote-item-supplier-body">
                      <p>
                        <strong>{item.providerName ?? 'Supplier'}</strong>
                        {item.contactEmail ? ` · ${item.contactEmail}` : ''}
                      </p>
                      <p className="quote-item-status">
                        Status:{' '}
                        <span className={`quote-rfq-status quote-rfq-status--${status ?? 'queued'}`}>
                          {status ?? 'queued'}
                        </span>
                        {item.sentAt ? ` · Sent ${formatQuoteRequestTime(item.sentAt)}` : ''}
                        {item.respondedAt ? ` · Responded ${formatQuoteRequestTime(item.respondedAt)}` : ''}
                      </p>
                      {status !== 'sent' && status !== 'responded' ? (
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={disabled}
                          onClick={() => resendSupplier(item)}
                        >
                          Open email compose
                        </button>
                      ) : (
                        <button type="button" className="btn-secondary" disabled={disabled} onClick={() => resendSupplier(item)}>
                          View / resend email
                        </button>
                      )}
                      {(item.responseQuote || rfq?.response_quote) && (
                        <div className="quote-supplier-response-callout">
                          <p>Quote detected from supplier ({item.responseSource ?? rfq?.response_source}).</p>
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => importSupplierResponse(item)}
                          >
                            Add as upload quote for customer
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </div>

      {showSupplierPicker ? (
        <QuoteSupplierRequestPicker
          quoteRequest={row}
          onClose={() => setShowSupplierPicker(false)}
          onCreated={({ item }) => {
            setItems([...quoteItems, item]);
            onRfqsRefresh();
          }}
        />
      ) : null}
    </div>
  );
}
