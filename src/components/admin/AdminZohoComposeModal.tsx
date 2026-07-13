'use client';

import { useEffect, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import type { AdminComposeLaunch } from '@/lib/email/admin-compose';
import { notifyAdminComposeSent } from '@/lib/email/admin-compose';
import { sendEmailReply } from '@/lib/assistant/types';

export function AdminZohoComposeModal({
  target,
  onClose,
}: {
  target: AdminComposeLaunch;
  onClose: () => void;
}) {
  const [to, setTo] = useState(target.to);
  const [cc, setCc] = useState(target.cc ?? '');
  const [subject, setSubject] = useState(target.subject);
  const [body, setBody] = useState(target.body ?? '');
  const [attachmentNote, setAttachmentNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTo(target.to);
    setCc(target.cc ?? '');
    setSubject(target.subject);
    setBody(target.body ?? '');
    setAttachmentNote('');
    setError(null);
    setSent(false);
  }, [target]);

  const fullBody = attachmentNote ? `${body}\n\n${attachmentNote}`.trim() : body;

  const send = async () => {
    if (!to.trim() || !fullBody.trim()) {
      setError('Recipient and message are required');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await sendEmailReply({
        to: to.trim(),
        cc: cc.trim() || undefined,
        subject: subject.trim() || '(no subject)',
        text: fullBody,
      });
      if (target.rfqId && target.quoteRequestId) {
        const rfqRes = await fetch(
          `/api/admin/quote-requests/${target.quoteRequestId}/supplier-rfqs/${target.rfqId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'sent',
              emailBody: fullBody,
              quoteItemId: target.quoteItemId,
            }),
          },
        );
        if (!rfqRes.ok) {
          const data = (await rfqRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? 'Email sent, but RFQ status update failed');
        }
      }
      if (target.contractSubmitActionId && target.contractSubmitIntent) {
        const op =
          target.contractSubmitIntent === 'customer'
            ? 'mark_customer_sent'
            : target.contractSubmitIntent === 'supplier_reply'
              ? 'log_supplier_reply'
              : 'mark_supplier_sent';
        const dealRes = await fetch('/api/admin/contract-submit-actions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: target.contractSubmitActionId,
            op,
            paySource: target.paySource,
            paysourcePartnerId: target.paysourcePartnerId,
            providerId: target.providerId,
            vendorName: target.vendorName,
            supplierContactEmail: to.trim(),
            email: {
              to: to.trim(),
              cc: cc.trim() || undefined,
              subject: subject.trim(),
              body: fullBody,
            },
          }),
        });
        if (!dealRes.ok) {
          const data = (await dealRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(
            data.error ?? 'Email sent, but deal status failed to update. Refresh and try again.',
          );
        }
      }
      notifyAdminComposeSent({
        rfqId: target.rfqId,
        quoteRequestId: target.quoteRequestId,
        quoteItemId: target.quoteItemId,
        contractSubmitActionId: target.contractSubmitActionId,
        contractSubmitIntent: target.contractSubmitIntent,
        paySource: target.paySource,
        paysourcePartnerId: target.paysourcePartnerId,
        providerId: target.providerId,
        vendorName: target.vendorName,
        supplierContactEmail: to.trim(),
        to: to.trim(),
        cc: cc.trim() || undefined,
        subject: subject.trim(),
        body: fullBody,
      });
      setSent(true);
      setTimeout(onClose, 700);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const onAttachFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const lines = Array.from(files).map((f) => `• ${f.name} (${Math.round(f.size / 1024)} KB)`);
    setAttachmentNote((prev) =>
      [prev, 'Attachments referenced in this email:', ...lines].filter(Boolean).join('\n'),
    );
  };

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box assist-modal assist-compose" role="dialog" aria-label="Compose email">
        <div className="assist-modal-head">
          <div className="assist-modal-title">
            <AppIcon name="email" size={14} /> Compose
            {target.contextLabel ? ` · ${target.contextLabel}` : ''}
          </div>
          <button type="button" className="assist-modal-close" onClick={onClose} aria-label="Close">
            <AppIcon name="close" size={14} />
          </button>
        </div>
        <div className="assist-modal-body">
          <label className="assist-field">
            <span>To</span>
            <input value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="assist-field">
            <span>Cc</span>
            <input
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="optional"
            />
          </label>
          <label className="assist-field">
            <span>Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <div className="assist-compose-body">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              placeholder="Write your message…"
            />
          </div>
          <label className="assist-field" style={{ marginTop: 8 }}>
            <span>Attachments (listed in email body)</span>
            <input type="file" multiple onChange={(e) => onAttachFiles(e.target.files)} />
          </label>
          {attachmentNote ? (
            <p className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
              {attachmentNote.split('\n').slice(0, 4).join(' · ')}
            </p>
          ) : null}
          {error && <div className="assist-form-error">{error}</div>}
        </div>
        <div className="assist-modal-foot">
          <button type="button" className="assist-mini-btn" onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button
            type="button"
            className="assist-mini-btn primary"
            onClick={() => void send()}
            disabled={sending || sent}
          >
            <AppIcon name="send" size={11} /> {sent ? 'Sent ✓' : sending ? 'Sending…' : 'Send via Zoho'}
          </button>
        </div>
      </div>
    </div>
  );
}
