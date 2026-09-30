'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  QUOTE_RESPONSE_REASONS,
  type QuoteResponseAction,
} from '@/lib/quotes/customer-response';

const COPY: Record<QuoteResponseAction, { title: string; note: string; confirm: string; placeholder: string }> = {
  decline: {
    title: 'Decline this quote?',
    note: 'Candid will close this quote. You can always request a new one.',
    confirm: 'Decline quote',
    placeholder: 'Anything else we should know?',
  },
  request_changes: {
    title: 'Request a modification',
    note: 'Your specialist will revise the quote and let you know when the updated version is ready.',
    confirm: 'Send request',
    placeholder: 'What would you like changed? e.g. 36-month term, 10 fewer users…',
  },
  cancel: {
    title: 'Cancel this request?',
    note: 'Candid will stop working on it. You can still see it under Closed requests.',
    confirm: 'Cancel request',
    placeholder: 'Anything else we should know?',
  },
};

/** Member Decline / Request modification / Cancel with multi-select reasons + free text (one required). */
export function QuoteResponseDialog({
  action,
  onSubmit,
  onClose,
}: {
  action: QuoteResponseAction;
  onSubmit: (reasons: string[], details: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reasons, setReasons] = useState<string[]>([]);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const copy = COPY[action];
  const canSubmit = reasons.length > 0 || details.trim().length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const toggle = (r: string) =>
    setReasons((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));

  const submit = async () => {
    if (!canSubmit) {
      setError('Choose a reason or tell us a bit more.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit(reasons, details.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
    }
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="modal-overlay open modal-overlay--stacked" onClick={() => !busy && onClose()}>
      <div
        className="modal-box close-req-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-response-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="close-req-body">
          <h3 id="quote-response-title" className="close-req-title">
            {copy.title}
          </h3>
          <div className="quote-response-label">Reason (choose any that apply)</div>
          <div className="quote-response-chips" role="group" aria-label="Reasons">
            {QUOTE_RESPONSE_REASONS[action].map((r) => (
              <button
                key={r}
                type="button"
                className={`quote-response-chip${reasons.includes(r) ? ' active' : ''}`}
                aria-pressed={reasons.includes(r)}
                onClick={() => toggle(r)}
              >
                {r}
              </button>
            ))}
          </div>
          <label className="close-req-reason">
            <span>{action === 'request_changes' ? 'Details' : 'Other / more detail'}</span>
            <textarea
              rows={3}
              maxLength={1000}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={copy.placeholder}
            />
          </label>
          <p className="close-req-note">{copy.note}</p>
          {error ? <p className="close-req-error">{error}</p> : null}
          <div className="close-req-actions">
            <button type="button" className="admin-ticket-btn" onClick={onClose} disabled={busy}>
              Back
            </button>
            <button
              type="button"
              className="admin-ticket-btn close-req-confirm"
              onClick={() => void submit()}
              disabled={busy || !canSubmit}
            >
              {busy ? 'Sending…' : copy.confirm}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
