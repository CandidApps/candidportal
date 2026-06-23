'use client';

import { useState } from 'react';
import type { ServiceCardModel } from '@/lib/services/account-services';
import type { MemberReviewRequestSource } from '@/lib/services/member-review-requests';

type Props = {
  service: ServiceCardModel;
  requestSource: MemberReviewRequestSource;
  userId: string;
  customerName: string;
  customerEmail: string;
  crmCustomerId?: string | null;
  onClose: () => void;
  onSubmitted: () => void | Promise<void>;
};

export function RequestReviewModal({
  service,
  requestSource,
  userId,
  customerName,
  customerEmail,
  crmCustomerId,
  onClose,
  onSubmitted,
}: Props) {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const text = message.trim();
    if (!text) {
      setError('Tell us what you would like help reviewing.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/portal/review-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountServiceId: service.id.startsWith('portal-') ? undefined : service.id,
          analysisReviewId: service.analysisReviewId ?? undefined,
          crmCustomerId: crmCustomerId ?? undefined,
          requestSource,
          serviceName: service.name,
          vendorName: service.vendor,
          customerName,
          customerEmail,
          message: text,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Request failed');
      await onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box" style={{ width: 520, maxWidth: '95vw' }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Request a review</div>
            <div className="modal-subtitle">
              {service.name}
              {service.vendor ? ` · ${service.vendor}` : ''}
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body" style={{ padding: '20px 24px 24px' }}>
          <p style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.55, marginTop: 0 }}>
            Our team will review this in the Action Center and on your account. Examples: savings analysis,
            contract renewal options, early termination help, or switching to Candid.
          </p>
          <label style={{ display: 'block' }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                color: 'var(--gray)',
              }}
            >
              What would you like help with?
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              placeholder="e.g. We're still under contract but want to explore early termination options, or please prioritize our savings analysis on this vendor."
              style={{
                display: 'block',
                width: '100%',
                marginTop: 8,
                border: '1px solid var(--gray-border)',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 14,
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </label>
          {error ? <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 0 }}>{error}</p> : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={() => void submit()} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit review request'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
