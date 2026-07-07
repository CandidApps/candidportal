'use client';

import { useState } from 'react';

type ActionReplyComposerProps = {
  label?: string;
  placeholder?: string;
  notifyLabel?: string;
  defaultNotify?: boolean;
  onSubmit: (replyMessage: string, notifyMember: boolean) => void | Promise<void>;
  disabled?: boolean;
  submitLabel?: string;
};

/** Shared reply composer for service tickets and review requests. */
export function ActionReplyComposer({
  label = 'Reply to customer',
  placeholder = 'Write a message the customer will see in their notification…',
  notifyLabel = 'Notify customer (in-app + email)',
  defaultNotify = true,
  onSubmit,
  disabled = false,
  submitLabel = 'Send reply',
}: ActionReplyComposerProps) {
  const [reply, setReply] = useState('');
  const [notify, setNotify] = useState(defaultNotify);
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await onSubmit(text, notify);
      setReply('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card action-reply-composer" style={{ marginTop: 16 }}>
      <div className="card-header">
        <div className="card-title">{label}</div>
      </div>
      <div className="card-body">
        <textarea
          className="form-textarea"
          rows={4}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder={placeholder}
          disabled={disabled || sending}
        />
        <label className="checkbox-row" style={{ marginTop: 10 }}>
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
            disabled={disabled || sending}
          />
          {notifyLabel}
        </label>
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn-primary"
            disabled={disabled || sending || !reply.trim()}
            onClick={() => void handleSubmit()}
          >
            {sending ? 'Sending…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
