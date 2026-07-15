'use client';

import { useEffect, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import {
  emailAttachmentDownloadUrl,
  fetchEmailAttachments,
  formatAttachmentSize,
  type EmailAttachmentInfo,
} from '@/lib/assistant/email-smart-sync';

export function EmailAttachmentsPanel({
  messageId,
  folderId,
  hasAttachment,
  selectable = false,
  selectedIds,
  onChangeSelected,
}: {
  messageId: string;
  folderId: string;
  hasAttachment?: boolean;
  selectable?: boolean;
  selectedIds?: string[];
  onChangeSelected?: (ids: string[]) => void;
}) {
  const [attachments, setAttachments] = useState<EmailAttachmentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!messageId || !folderId) return;
    // Always try to load — Zoho's hasAttachment flag is best-effort.
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchEmailAttachments(messageId, folderId)
      .then((list) => {
        if (!cancelled) setAttachments(list);
      })
      .catch((e) => {
        if (!cancelled && hasAttachment) {
          setError(e instanceof Error ? e.message : 'Could not load attachments');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [messageId, folderId, hasAttachment]);

  if (!loading && !error && attachments.length === 0) {
    if (!hasAttachment) return null;
    return (
      <div className="assist-email-attachments">
        <div className="assist-email-attachments-empty">No attachments found on this message.</div>
      </div>
    );
  }

  const selected = new Set(selectedIds ?? []);

  const toggle = (id: string) => {
    if (!onChangeSelected) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChangeSelected([...next]);
  };

  return (
    <div className="assist-email-attachments">
      <div className="assist-email-attachments-head">
        <AppIcon name="paperclip" size={12} />
        Attachments
        {attachments.length > 0 ? <span>{attachments.length}</span> : null}
      </div>
      {loading ? (
        <div className="assist-brief-loading">
          <span className="assist-spinner" /> Loading attachments…
        </div>
      ) : null}
      {error ? <p className="assist-form-error">{error}</p> : null}
      <ul className="assist-email-attachments-list">
        {attachments.map((a) => {
          const href = emailAttachmentDownloadUrl(messageId, folderId, a.attachmentId);
          const isSelected = selected.has(a.attachmentId);
          return (
            <li key={a.attachmentId}>
              {selectable ? (
                <label className={`assist-email-attach-row${isSelected ? ' selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(a.attachmentId)}
                  />
                  <AppIcon name="file" size={12} />
                  <span className="assist-email-attach-name">{a.attachmentName}</span>
                  <span className="assist-email-attach-size">
                    {formatAttachmentSize(a.attachmentSize)}
                  </span>
                </label>
              ) : (
                <a
                  className="assist-email-attach-row"
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <AppIcon name="file" size={12} />
                  <span className="assist-email-attach-name">{a.attachmentName}</span>
                  <span className="assist-email-attach-size">
                    {formatAttachmentSize(a.attachmentSize)}
                  </span>
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
