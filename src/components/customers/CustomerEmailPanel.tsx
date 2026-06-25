'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchCustomerConversation,
  fetchMessageContent,
  sendCustomerEmail,
  type ConversationMessage,
} from '@/lib/email/client';

function formatWhen(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function CustomerEmailPanel({
  email,
  customerName,
}: {
  email: string | undefined;
  customerName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(true);
  const [mailbox, setMailbox] = useState<string | undefined>();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [contentById, setContentById] = useState<Record<string, string>>({});
  const [composeOpen, setComposeOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!email) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchCustomerConversation(email);
      setConnected(res.connected);
      setMailbox(res.mailbox);
      setMessages(res.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load email');
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleMessage = async (m: ConversationMessage) => {
    if (expandedId === m.messageId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(m.messageId);
    if (!contentById[m.messageId] && email) {
      try {
        const content = await fetchMessageContent(email, m.messageId, m.folderId);
        setContentById((prev) => ({ ...prev, [m.messageId]: content }));
      } catch {
        setContentById((prev) => ({ ...prev, [m.messageId]: '<em>Could not load message.</em>' }));
      }
    }
  };

  const send = async () => {
    if (!email || !bodyText.trim()) return;
    setSending(true);
    setError('');
    setNotice('');
    try {
      const { sentFrom } = await sendCustomerEmail({
        to: email,
        subject: subject.trim() || `A note from ${customerName ? 'Candid' : 'Candid'}`,
        text: bodyText.trim(),
      });
      setNotice(`Sent from ${sentFrom}.`);
      setSubject('');
      setBodyText('');
      setComposeOpen(false);
      // Give Zoho a moment to index, then refresh the thread.
      setTimeout(() => void load(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  if (!email) {
    return <div className="cust-email-empty">No email on file for this customer.</div>;
  }

  if (!connected) {
    return (
      <div className="cust-email-empty">
        No Zoho mailbox connected. Connect your mailbox from the account menu (top-right avatar) to
        view and send customer email.
      </div>
    );
  }

  return (
    <div className="cust-email">
      <div className="cust-email-toolbar">
        <div className="cust-email-mailbox">
          {mailbox ? `Mailbox: ${mailbox}` : ''}
        </div>
        <div className="cust-email-actions">
          <button type="button" className="admin-ticket-btn" disabled={loading} onClick={() => void load()}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button
            type="button"
            className="admin-ticket-btn primary"
            onClick={() => setComposeOpen((o) => !o)}
          >
            {composeOpen ? 'Cancel' : 'Compose'}
          </button>
        </div>
      </div>

      {notice ? <div className="cust-email-notice">{notice}</div> : null}
      {error ? <div className="cust-email-error">{error}</div> : null}

      {composeOpen ? (
        <div className="cust-email-compose">
          <div className="cust-email-compose-to">To: {email}</div>
          <input
            className="cust-email-input"
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <textarea
            className="cust-email-textarea"
            rows={5}
            placeholder="Write your message…"
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
          />
          <div className="cust-email-compose-actions">
            <button
              type="button"
              className="admin-ticket-btn primary"
              disabled={sending || !bodyText.trim()}
              onClick={() => void send()}
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      ) : null}

      {loading && messages.length === 0 ? (
        <div className="cust-email-empty">Loading conversation…</div>
      ) : messages.length === 0 ? (
        <div className="cust-email-empty">No email found with {email}.</div>
      ) : (
        <ul className="cust-email-list">
          {messages.map((m) => {
            const inbound = m.fromAddress.toLowerCase() === email.toLowerCase();
            const expanded = expandedId === m.messageId;
            return (
              <li key={m.messageId} className={`cust-email-item${expanded ? ' expanded' : ''}`}>
                <button type="button" className="cust-email-row" onClick={() => void toggleMessage(m)}>
                  <span className={`cust-email-dir ${inbound ? 'in' : 'out'}`}>
                    {inbound ? 'In' : 'Out'}
                  </span>
                  <span className="cust-email-meta">
                    <span className="cust-email-subject">{m.subject}</span>
                    <span className="cust-email-sender">{m.sender || m.fromAddress}</span>
                  </span>
                  <span className="cust-email-time">{formatWhen(m.receivedTime || m.sentTime)}</span>
                </button>
                {expanded ? (
                  <div className="cust-email-body">
                    {contentById[m.messageId] != null ? (
                      <div
                        className="cust-email-html"
                        dangerouslySetInnerHTML={{ __html: contentById[m.messageId]! }}
                      />
                    ) : (
                      <div className="cust-email-loading">Loading message…</div>
                    )}
                  </div>
                ) : (
                  <div className="cust-email-summary">{m.summary}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
