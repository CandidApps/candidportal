'use client';

import { useEffect, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import type { AdminComposeLaunch } from '@/lib/email/admin-compose';
import { sendEmailReply } from '@/lib/assistant/types';

export function AdminZohoComposeModal({
  target,
  onClose,
}: {
  target: AdminComposeLaunch;
  onClose: () => void;
}) {
  const [to, setTo] = useState(target.to);
  const [subject, setSubject] = useState(target.subject);
  const [body, setBody] = useState(target.body ?? '');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTo(target.to);
    setSubject(target.subject);
    setBody(target.body ?? '');
    setError(null);
    setSent(false);
  }, [target]);

  const send = async () => {
    if (!to.trim() || !body.trim()) {
      setError('Recipient and message are required');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await sendEmailReply({
        to: to.trim(),
        subject: subject.trim() || '(no subject)',
        text: body,
      });
      setSent(true);
      setTimeout(onClose, 700);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
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
