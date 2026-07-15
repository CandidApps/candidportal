'use client';

import { useEffect, useMemo, useState } from 'react';
import type { QuoteRequestRow } from '@/lib/services/quote-requests';
import type { QuoteSupplierOption } from '@/lib/quotes/types';
import { buildRfqEmailBody, buildRfqEmailSubject } from '@/lib/quotes/rfq-template';
import { launchAdminZohoCompose } from '@/lib/email/admin-compose';

type SubmitToSupplierModalProps = {
  quoteRequest: QuoteRequestRow;
  onClose: () => void;
  onSubmitted?: () => void;
};

export function SubmitToSupplierModal({ quoteRequest, onClose, onSubmitted }: SubmitToSupplierModalProps) {
  const [suppliers, setSuppliers] = useState<QuoteSupplierOption[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [includeCustomerContact, setIncludeCustomerContact] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [queue, setQueue] = useState<QuoteSupplierOption[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
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

  const selectedSuppliers = useMemo(
    () => suppliers.filter((s) => selectedKeys.has(supplierKey(s))),
    [suppliers, selectedKeys],
  );

  const toggleSupplier = (s: QuoteSupplierOption) => {
    const key = supplierKey(s);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const startSendQueue = async () => {
    if (!selectedSuppliers.length) return;
    setSubmitting(true);
    setError('');
    const subject = buildRfqEmailSubject(quoteRequest);
    try {
      const res = await fetch(`/api/admin/quote-requests/${quoteRequest.id}/supplier-rfqs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfqs: selectedSuppliers.map((s) => ({
            providerId: s.providerId,
            providerName: s.providerName,
            contactName: s.contactName,
            contactEmail: s.contactEmail,
            rfqSubject: subject,
          })),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to log supplier RFQs');
      setQueue(selectedSuppliers);
      setStep(1);
      onSubmitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start supplier send');
    } finally {
      setSubmitting(false);
    }
  };

  const openCurrentEmail = () => {
    const current = queue[step - 1];
    if (!current) return;
    const subject = buildRfqEmailSubject(quoteRequest);
    const body = buildRfqEmailBody(quoteRequest, { includeCustomerContact });
    launchAdminZohoCompose({
      to: current.contactEmail,
      subject,
      body,
      contextLabel: `${current.providerName} — supplier RFQ`,
    });
  };

  const advanceQueue = () => {
    if (step >= queue.length) {
      onClose();
      return;
    }
    setStep((s) => s + 1);
  };

  if (step > 0 && queue.length) {
    const current = queue[step - 1];
    const isLast = step >= queue.length;
    return (
      <div className="modal-overlay open" role="presentation">
        <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Email supplier {step} of {queue.length}</h3>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
          <div className="modal-body">
            <p>
              Send a separate RFQ to <strong>{current.providerName}</strong> ({current.contactEmail}).
              Each supplier receives their own email — never a group send.
            </p>
            <div className="form-group" style={{ marginTop: 16 }}>
              <button type="button" className="btn-primary" onClick={openCurrentEmail}>
                Open Zoho compose
              </button>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={advanceQueue}>
              {isLast ? 'Done' : 'Next supplier'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay open" role="presentation">
      <div className="modal-card modal-card--wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Submit to supplier</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          {loading ? <p>Loading suppliers…</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
          {!loading && !suppliers.length ? (
            <p>No supplier contacts found for this service category. Add contacts in Solution Providers.</p>
          ) : null}

          {!loading && suppliers.length ? (
            <>
              <p className="text-muted" style={{ marginBottom: 12 }}>
                Select one or more suppliers. Each will receive a separate RFQ email via Zoho.
              </p>
              <label className="checkbox-row" style={{ marginBottom: 16 }}>
                <input
                  type="checkbox"
                  checked={includeCustomerContact}
                  onChange={(e) => setIncludeCustomerContact(e.target.checked)}
                />
                Include customer contact info in RFQ body
              </label>
              <div className="supplier-rfq-list">
                {suppliers.map((s) => {
                  const key = supplierKey(s);
                  const checked = selectedKeys.has(key);
                  return (
                    <label key={key} className={`supplier-rfq-row${checked ? ' supplier-rfq-row--selected' : ''}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleSupplier(s)} />
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
          ) : null}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!selectedSuppliers.length || submitting}
            onClick={() => void startSendQueue()}
          >
            {submitting ? 'Starting…' : `Send to ${selectedSuppliers.length || ''} supplier${selectedSuppliers.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
