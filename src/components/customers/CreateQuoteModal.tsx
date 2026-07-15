'use client';

import { useState } from 'react';
import { AppIcon } from '@/components/AppIcon';

const QUOTE_TYPES = [
  'Merchant Services',
  'UCaaS / Phone',
  'Internet / Broadband',
  'Microsoft 365',
  'Cybersecurity',
  'Other',
];

/**
 * Admin "Create a quote" for a specific customer record (TASK-025). Mirrors the
 * analysis flow shape: pick type + provider, then use the pricing tool or upload
 * an external quote, and save as draft or submit to the customer.
 */
export function CreateQuoteModal({
  customerId,
  customerName,
  onClose,
  onNotify,
}: {
  customerId: string;
  customerName: string;
  onClose: () => void;
  onNotify?: (message: string) => void;
}) {
  const [type, setType] = useState<string>(QUOTE_TYPES[0]);
  const [provider, setProvider] = useState('');
  const [method, setMethod] = useState<'pricing' | 'upload'>('pricing');
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (status: 'draft' | 'submitted') => {
    setSaving(true);
    try {
      const form = new FormData();
      form.set('customerId', customerId);
      form.set('type', type);
      form.set('provider', provider);
      form.set('method', method);
      form.set('status', status);
      form.set('note', note);
      if (file) form.set('file', file);
      const res = await fetch('/api/admin/quotes', { method: 'POST', body: form });
      if (!res.ok) throw new Error('save failed');
      onNotify?.(
        status === 'draft'
          ? 'Quote saved as draft.'
          : `Quote submitted to ${customerName}.`,
      );
      onClose();
    } catch {
      onNotify?.('Could not save the quote. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay open">
      <div className="modal-box assist-modal" role="dialog" aria-label="Create a quote">
        <div className="assist-modal-head">
          <div className="assist-modal-title">
            <AppIcon name="reports" size={14} /> Create a quote · {customerName}
          </div>
          <button type="button" className="assist-modal-close" onClick={onClose} aria-label="Close">
            <AppIcon name="close" size={14} />
          </button>
        </div>
        <div className="assist-modal-body">
          <label className="assist-field">
            <span>Quote type</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {QUOTE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="assist-field">
            <span>Provider</span>
            <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. CandidPay, RingCentral…" />
          </label>
          <div className="assist-field">
            <span>Method</span>
            <div className="cq-method-row">
              <button
                type="button"
                className={`cq-method${method === 'pricing' ? ' active' : ''}`}
                onClick={() => setMethod('pricing')}
              >
                <AppIcon name="chart" size={13} /> Use pricing tool
              </button>
              <button
                type="button"
                className={`cq-method${method === 'upload' ? ' active' : ''}`}
                onClick={() => setMethod('upload')}
              >
                <AppIcon name="file" size={13} /> Upload external quote
              </button>
            </div>
          </div>
          {method === 'upload' && (
            <label className="assist-field">
              <span>Quote file</span>
              <input type="file" accept=".pdf,.xlsx,.xls,.docx,.doc,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          )}
          <label className="assist-field">
            <span>Notes</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Context for this quote…" />
          </label>
        </div>
        <div className="assist-modal-foot">
          <button type="button" className="assist-mini-btn" onClick={() => void submit('draft')} disabled={saving}>
            Save as draft
          </button>
          <button type="button" className="assist-mini-btn primary" onClick={() => void submit('submitted')} disabled={saving || !provider.trim()}>
            <AppIcon name="send" size={11} /> Submit to customer
          </button>
        </div>
      </div>
    </div>
  );
}
