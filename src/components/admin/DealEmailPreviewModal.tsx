'use client';

import type { DealActivityEventRow } from '@/lib/services/deal-activity';

export type DealEmailPayload = {
  to?: string;
  cc?: string;
  subject?: string;
  body?: string;
  bodyExcerpt?: string;
  intent?: string;
  paySource?: string;
  from?: string;
};

function payloadLooksLikeEmail(p: Record<string, unknown>): boolean {
  return (
    typeof p.subject === 'string' ||
    typeof p.to === 'string' ||
    typeof p.body === 'string' ||
    typeof p.bodyExcerpt === 'string'
  );
}

export function emailPayloadFromEvent(event: DealActivityEventRow): DealEmailPayload | null {
  const p = event.payload ?? {};
  const isEmailEvent =
    event.event_type === 'email_sent' || event.event_type === 'email_received';
  // Successful compose also stores to/subject/body on the status_change payload.
  const isStatusEmail =
    event.event_type === 'status_change' && payloadLooksLikeEmail(p) && Boolean(p.subject || p.body);
  if (!isEmailEvent && !isStatusEmail) {
    return null;
  }
  const body =
    (typeof p.body === 'string' && p.body) ||
    (typeof p.bodyExcerpt === 'string' && p.bodyExcerpt) ||
    '';
  if (!body && !p.subject && !p.to) return null;
  return {
    to: typeof p.to === 'string' ? p.to : undefined,
    cc: typeof p.cc === 'string' ? p.cc : undefined,
    subject: typeof p.subject === 'string' ? p.subject : undefined,
    body: typeof p.body === 'string' ? p.body : undefined,
    bodyExcerpt: typeof p.bodyExcerpt === 'string' ? p.bodyExcerpt : undefined,
    intent: typeof p.intent === 'string' ? p.intent : undefined,
    paySource: typeof p.paySource === 'string' ? p.paySource : undefined,
    from: typeof p.from === 'string' ? p.from : undefined,
  };
}

type DealEmailPreviewModalProps = {
  event: DealActivityEventRow;
  onClose: () => void;
};

export function DealEmailPreviewModal({ event, onClose }: DealEmailPreviewModalProps) {
  const email = emailPayloadFromEvent(event);
  const bodyText = email?.body || email?.bodyExcerpt || '';
  const title =
    event.event_type === 'email_received' ? 'Email received' : 'Email sent';

  return (
    <div className="modal-overlay open" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deal-email-preview-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720, maxHeight: '90vh', overflow: 'auto' }}
      >
        <div className="modal-header">
          <h3 id="deal-email-preview-title">{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--gray)' }}>
            {new Date(event.created_at).toLocaleString()}
            {email?.intent ? ` · ${email.intent}` : ''}
            {email?.paySource ? ` · Pay source: ${email.paySource}` : ''}
          </div>
          {email?.from ? (
            <Field label="From">{email.from}</Field>
          ) : null}
          {email?.to ? <Field label="To">{email.to}</Field> : null}
          {email?.cc ? <Field label="Cc">{email.cc}</Field> : null}
          {email?.subject ? <Field label="Subject">{email.subject}</Field> : null}
          <div>
            <div className="ticket-detail-field-label">Body</div>
            <pre
              style={{
                margin: '6px 0 0',
                padding: 12,
                borderRadius: 8,
                border: '1px solid var(--gray-border)',
                background: 'var(--surface-muted, #f8fafc)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 13,
                lineHeight: 1.5,
                fontFamily: 'inherit',
                maxHeight: 420,
                overflow: 'auto',
              }}
            >
              {bodyText || '(No body saved for this email.)'}
            </pre>
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="admin-ticket-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <div className="ticket-detail-field-label">{label}</div>
      <div className="ticket-detail-field-value" style={{ fontSize: 13 }}>
        {children}
      </div>
    </div>
  );
}
