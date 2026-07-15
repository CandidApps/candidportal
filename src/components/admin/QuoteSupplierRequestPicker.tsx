'use client';

import { useEffect, useMemo, useState } from 'react';
import type { QuoteRequestRow } from '@/lib/services/quote-requests';
import type { QuoteSupplierOption } from '@/lib/quotes/types';
import { buildRfqEmailBody, buildRfqEmailSubject } from '@/lib/quotes/rfq-template';
import { launchAdminZohoCompose } from '@/lib/email/admin-compose';
import { createQuoteItem } from '@/lib/quotes/quote-items';

type Props = {
  quoteRequest: QuoteRequestRow;
  onClose: () => void;
  onCreated: (payload: {
    item: ReturnType<typeof createQuoteItem>;
    rfqId: string;
  }) => void;
};

export function QuoteSupplierRequestPicker({ quoteRequest, onClose, onCreated }: Props) {
  const [suppliers, setSuppliers] = useState<QuoteSupplierOption[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualProvider, setManualProvider] = useState('');
  const [useManual, setUseManual] = useState(false);
  const [includeCustomerContact, setIncludeCustomerContact] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/quote-requests/${quoteRequest.id}/suppliers`);
        const data = (await res.json()) as { suppliers?: QuoteSupplierOption[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? 'Failed to load suppliers');
        if (!cancelled) setSuppliers(data.suppliers ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load suppliers');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quoteRequest.id]);

  const supplierKey = (s: QuoteSupplierOption) => `${s.providerId}:${s.contactId}`;
  const selectedSupplier = useMemo(
    () => suppliers.find((s) => supplierKey(s) === selectedKey) ?? null,
    [suppliers, selectedKey],
  );

  const contactEmail = useManual ? manualEmail.trim() : selectedSupplier?.contactEmail ?? '';
  const contactName = useManual ? manualName.trim() : selectedSupplier?.contactName ?? '';
  const providerName = useManual ? manualProvider.trim() || 'Supplier' : selectedSupplier?.providerName ?? '';
  const providerId = useManual ? 0 : selectedSupplier?.providerId ?? 0;

  const startCompose = async () => {
    if (!contactEmail) {
      setError('Choose a supplier contact or enter an email address.');
      return;
    }
    setSubmitting(true);
    setError('');
    const subject = buildRfqEmailSubject(quoteRequest);
    const body = buildRfqEmailBody(quoteRequest, { includeCustomerContact });
    const item = createQuoteItem('supplier_request', {
      providerId: providerId || undefined,
      providerName,
      contactName: contactName || undefined,
      contactEmail,
      rfqStatus: 'queued',
      label: `Supplier — ${providerName}`,
    });

    try {
      const res = await fetch(`/api/admin/quote-requests/${quoteRequest.id}/supplier-rfqs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfqs: [
            {
              providerId,
              providerName,
              contactName,
              contactEmail,
              rfqSubject: subject,
              quoteItemId: item.id,
              status: 'queued',
            },
          ],
        }),
      });
      const data = (await res.json()) as { rfqs?: { id: string }[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to create supplier request');
      const rfqId = data.rfqs?.[0]?.id;
      if (!rfqId) throw new Error('RFQ not created');

      onCreated({ item: { ...item, supplierRfqId: rfqId }, rfqId });
      launchAdminZohoCompose({
        to: contactEmail,
        subject,
        body,
        contextLabel: `${providerName} — supplier RFQ`,
        rfqId,
        quoteRequestId: quoteRequest.id,
        quoteItemId: item.id,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start supplier request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay open" role="presentation">
      <div
        className="modal-card modal-card--wide"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Request from supplier</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          {loading ? <p>Loading suppliers…</p> : null}
          {error ? <p className="form-error">{error}</p> : null}

          <label className="checkbox-row" style={{ marginBottom: 16 }}>
            <input type="checkbox" checked={useManual} onChange={(e) => setUseManual(e.target.checked)} />
            Enter email manually (no supplier on file)
          </label>

          {useManual ? (
            <div className="quote-supplier-manual-fields">
              <label className="form-group">
                <span className="form-label">Supplier name</span>
                <input
                  className="form-input"
                  value={manualProvider}
                  onChange={(e) => setManualProvider(e.target.value)}
                  placeholder="e.g. Acme Telecom"
                />
              </label>
              <label className="form-group">
                <span className="form-label">Contact name</span>
                <input
                  className="form-input"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                />
              </label>
              <label className="form-group">
                <span className="form-label">Email</span>
                <input
                  className="form-input"
                  type="email"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  placeholder="rep@supplier.com"
                />
              </label>
            </div>
          ) : (
            <>
              {!loading && !suppliers.length ? (
                <p>No supplier contacts for this category — use manual email or add contacts in Partners.</p>
              ) : null}
              <div className="supplier-rfq-list">
                {suppliers.map((s) => {
                  const key = supplierKey(s);
                  const checked = selectedKey === key;
                  return (
                    <label
                      key={key}
                      className={`supplier-rfq-row${checked ? ' supplier-rfq-row--selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="supplier-contact"
                        checked={checked}
                        onChange={() => setSelectedKey(key)}
                      />
                      <div>
                        <div className="supplier-rfq-name">{s.providerName}</div>
                        <div className="supplier-rfq-meta">
                          {s.contactName} · {s.contactEmail}
                          {s.clientFacing ? ' · Client-facing' : ''}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </>
          )}

          <label className="checkbox-row" style={{ marginTop: 16 }}>
            <input
              type="checkbox"
              checked={includeCustomerContact}
              onChange={(e) => setIncludeCustomerContact(e.target.checked)}
            />
            Include customer contact info in email body
          </label>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={submitting || !contactEmail}
            onClick={() => void startCompose()}
          >
            {submitting ? 'Opening compose…' : 'Compose email'}
          </button>
        </div>
      </div>
    </div>
  );
}
