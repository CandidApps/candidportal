'use client';

import { useState } from 'react';
import { looksLikeHtml, sanitizeEmailHtml } from '@/lib/rich-text';

export type SupplierReplyPreview = {
  messageId?: string;
  folderId?: string;
  from: string;
  subject: string;
  hasAttachment?: boolean;
  receivedAt?: string | null;
  bodyText?: string;
  bodyHtml?: string;
  links?: string[];
};

type SupplierContractReplyModalProps = {
  reply: SupplierReplyPreview;
  reason?: string;
  busy?: boolean;
  onClose: () => void;
  onImport: (input: { url?: string | null; name?: string | null }) => void | Promise<void>;
};

export function SupplierContractReplyModal({
  reply,
  reason,
  busy = false,
  onClose,
  onImport,
}: SupplierContractReplyModalProps) {
  const [selectedUrl, setSelectedUrl] = useState<string>(reply.links?.[0] ?? '');
  const [manualUrl, setManualUrl] = useState('');

  const url = (manualUrl.trim() || selectedUrl.trim() || null) as string | null;
  const htmlSource = reply.bodyHtml?.trim() || '';
  const showHtml = Boolean(htmlSource && looksLikeHtml(htmlSource));
  const bodyStyle = {
    margin: '6px 0 0' as const,
    padding: 12,
    borderRadius: 8,
    border: '1px solid var(--gray-border)',
    background: 'var(--surface-muted, #f8fafc)',
    fontSize: 13,
    lineHeight: 1.5,
    fontFamily: 'inherit' as const,
    maxHeight: 280,
    overflow: 'auto' as const,
    color: 'var(--gray-dark)',
  };

  return (
    <div className="modal-overlay open" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="supplier-reply-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720, maxHeight: '92vh', overflow: 'auto' }}
      >
        <div className="modal-header">
          <h3 id="supplier-reply-title">Supplier reply</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
          {reason ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--gray-dark)' }}>{reason}</p>
          ) : null}

          <div style={{ fontSize: 12, color: 'var(--gray)' }}>
            {reply.receivedAt ? new Date(reply.receivedAt).toLocaleString() : null}
            {reply.hasAttachment ? ' · Has attachment' : ''}
          </div>
          <Field label="From">{reply.from}</Field>
          <Field label="Subject">{reply.subject || '(no subject)'}</Field>

          <div>
            <div className="ticket-detail-field-label">Body</div>
            {showHtml ? (
              <div
                style={bodyStyle}
                dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(htmlSource) }}
              />
            ) : (
              <pre
                style={{
                  ...bodyStyle,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {reply.bodyText || '(Empty body)'}
              </pre>
            )}
          </div>

          {(reply.links?.length ?? 0) > 0 ? (
            <div>
              <div className="ticket-detail-field-label" style={{ marginBottom: 6 }}>
                Links found in email
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {reply.links!.map((link) => (
                  <label
                    key={link}
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'flex-start',
                      fontSize: 12,
                      color: 'var(--gray-dark)',
                    }}
                  >
                    <input
                      type="radio"
                      name="contract-link"
                      checked={selectedUrl === link && !manualUrl.trim()}
                      onChange={() => {
                        setSelectedUrl(link);
                        setManualUrl('');
                      }}
                      disabled={busy}
                      style={{ marginTop: 2 }}
                    />
                    <a href={link} target="_blank" rel="noopener noreferrer" style={{ wordBreak: 'break-all' }}>
                      {link}
                    </a>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--gray)' }}>
              No links were extracted automatically. Paste a contract URL below if needed.
            </p>
          )}

          <div>
            <div className="ticket-detail-field-label">Or paste contract URL</div>
            <input
              type="url"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="https://…"
              disabled={busy}
              style={{
                width: '100%',
                marginTop: 6,
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid var(--gray-border)',
                fontSize: 13,
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="admin-ticket-btn" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button
            type="button"
            className="admin-ticket-btn"
            disabled={busy}
            onClick={() => void onImport({ url: null, name: 'Imported from supplier email' })}
          >
            Import without link
          </button>
          <button
            type="button"
            className="admin-ticket-btn primary"
            disabled={busy || !url}
            onClick={() =>
              void onImport({
                url,
                name: url ? 'Contract link' : 'Imported from supplier email',
              })
            }
          >
            {busy ? 'Importing…' : 'Import contract from this email'}
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
