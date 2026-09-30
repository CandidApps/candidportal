'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ClosableRequestKind } from '@/lib/services/request-close';

const NOUN: Record<ClosableRequestKind, [string, string]> = {
  quote: ['quote request', 'quote requests'],
  analysis: ['analysis', 'analyses'],
};

/** Confirm closing or cancelling quote requests / analyses, with an optional reason. */
export function CloseRequestDialog({
  kind,
  count,
  defaultAction = 'close',
  audience = 'admin',
  onConfirm,
  onClose,
}: {
  kind: ClosableRequestKind;
  count: number;
  defaultAction?: 'close' | 'cancel';
  /** Members can only cancel their own request, so they get a simpler confirm. */
  audience?: 'admin' | 'member';
  onConfirm: (action: 'close' | 'cancel', reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [action, setAction] = useState<'close' | 'cancel'>(audience === 'member' ? 'cancel' : defaultAction);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const noun = NOUN[kind][count === 1 ? 0 : 1];
  const subject = count === 1 ? `this ${noun}` : `${count} ${noun}`;

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm(action, reason.trim());
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
        aria-labelledby="close-req-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="close-req-body">
          <h3 id="close-req-title" className="close-req-title">
            {audience === 'member' ? `Cancel ${subject}?` : `Close or cancel ${subject}?`}
          </h3>
          {audience === 'admin' ? (
            <div className="close-req-options" role="radiogroup" aria-label="Close or cancel">
              <label className={`close-req-option${action === 'close' ? ' active' : ''}`}>
                <input
                  type="radio"
                  name="close-req-action"
                  checked={action === 'close'}
                  onChange={() => setAction('close')}
                />
                <span>
                  <strong>Close</strong>
                  <span className="close-req-hint">Done or no longer needed</span>
                </span>
              </label>
              <label className={`close-req-option${action === 'cancel' ? ' active' : ''}`}>
                <input
                  type="radio"
                  name="close-req-action"
                  checked={action === 'cancel'}
                  onChange={() => setAction('cancel')}
                />
                <span>
                  <strong>Cancel</strong>
                  <span className="close-req-hint">Created by mistake or a duplicate</span>
                </span>
              </label>
            </div>
          ) : null}
          {audience === 'admin' ? (
            <label className="close-req-reason">
              <span>Reason (optional)</span>
              <textarea
                rows={2}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={action === 'cancel' ? 'e.g. Duplicate of the Sep 12 request' : 'e.g. Customer went another direction'}
              />
            </label>
          ) : null}
          <p className="close-req-note">
            {audience === 'member'
              ? 'Candid will stop working on it. You can still see it under Closed requests.'
              : 'It leaves the open queues and the Action center, and the customer no longer sees it as open. You can reopen it from the Closed list.'}
          </p>
          {error ? <p className="close-req-error">{error}</p> : null}
          <div className="close-req-actions">
            <button type="button" className="admin-ticket-btn" onClick={onClose} disabled={busy}>
              {audience === 'member' ? 'Keep it' : 'Back'}
            </button>
            <button type="button" className="admin-ticket-btn close-req-confirm" onClick={() => void confirm()} disabled={busy}>
              {busy ? 'Saving…' : `${action === 'cancel' ? 'Cancel' : 'Close'} ${noun}`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Notify list owners (admin shell, account view) that quotes/analyses were closed or reopened. */
export function announceRequestsClosed(kind: ClosableRequestKind) {
  window.dispatchEvent(new CustomEvent('candid:requests-closed', { detail: { kind } }));
}
