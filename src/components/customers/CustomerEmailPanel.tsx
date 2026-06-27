'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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

export type MailContact = { name: string; email: string; role?: string; relation?: string };

export function CustomerEmailPanel({
  email,
  customerName,
  contacts = [],
  associatedContacts = [],
}: {
  email: string | undefined;
  customerName: string;
  /** Other contacts on this account/location — surfaced as recommended (TASK-015). */
  contacts?: MailContact[];
  /** Supplier contacts / agents tied to the account — shown when "Include contacts" is on. */
  associatedContacts?: MailContact[];
}) {
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(true);
  const [mailbox, setMailbox] = useState<string | undefined>();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [contentById, setContentById] = useState<Record<string, string>>({});
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [includeContacts, setIncludeContacts] = useState(false);

  // Build the de-duplicated address list to load. Default = primary contact +
  // other contacts on the account; "Include contacts" adds associated suppliers/agents.
  const addresses = useMemo(() => {
    const set = new Map<string, MailContact>();
    if (email) set.set(email.toLowerCase(), { name: customerName, email });
    for (const c of contacts) if (c.email) set.set(c.email.toLowerCase(), c);
    if (includeContacts) for (const c of associatedContacts) if (c.email) set.set(c.email.toLowerCase(), c);
    return [...set.values()];
  }, [email, customerName, contacts, associatedContacts, includeContacts]);

  const load = useCallback(async () => {
    if (addresses.length === 0) return;
    setLoading(true);
    setError('');
    try {
      const results = await Promise.all(
        addresses.map((a) => fetchCustomerConversation(a.email).catch(() => null)),
      );
      const live = results.filter((r): r is NonNullable<typeof r> => r != null);
      setConnected(live.some((r) => r.connected) || live.length === 0);
      setMailbox(live.find((r) => r.mailbox)?.mailbox);
      const byId = new Map<string, ConversationMessage>();
      for (const r of live) for (const m of r.messages) byId.set(m.messageId, m);
      const merged = [...byId.values()].sort(
        (a, b) => (b.receivedTime || b.sentTime) - (a.receivedTime || a.sentTime),
      );
      setMessages(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load email');
    } finally {
      setLoading(false);
    }
  }, [addresses]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!composeTo && email) setComposeTo(email);
  }, [composeTo, email]);

  const toggleMessage = async (m: ConversationMessage) => {
    if (expandedId === m.messageId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(m.messageId);
    const lookupEmail = email || addresses[0]?.email;
    if (!contentById[m.messageId] && lookupEmail) {
      try {
        const content = await fetchMessageContent(lookupEmail, m.messageId, m.folderId);
        setContentById((prev) => ({ ...prev, [m.messageId]: content }));
      } catch {
        setContentById((prev) => ({ ...prev, [m.messageId]: '<em>Could not load message.</em>' }));
      }
    }
  };

  const send = async () => {
    const to = (composeTo || email || '').trim();
    if (!to || !bodyText.trim()) return;
    setSending(true);
    setError('');
    setNotice('');
    try {
      const { sentFrom } = await sendCustomerEmail({
        to,
        subject: subject.trim() || `A note from Candid`,
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

  if (addresses.length === 0) {
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
          {associatedContacts.length > 0 && (
            <label className="cust-email-toggle">
              <input
                type="checkbox"
                checked={includeContacts}
                onChange={(e) => setIncludeContacts(e.target.checked)}
              />
              Include contacts
            </label>
          )}
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
          <input
            className="cust-email-input"
            placeholder="To (email address)"
            value={composeTo}
            onChange={(e) => setComposeTo(e.target.value)}
          />
          {(contacts.length > 0 || (includeContacts && associatedContacts.length > 0)) && (
            <div className="cust-email-recommend">
              <span className="cust-email-recommend-label">Recommended:</span>
              {[...contacts, ...(includeContacts ? associatedContacts : [])]
                .filter((c) => c.email)
                .map((c) => (
                  <button
                    key={c.email}
                    type="button"
                    className={`cust-email-chip${composeTo.toLowerCase() === c.email.toLowerCase() ? ' active' : ''}`}
                    onClick={() => setComposeTo(c.email)}
                    title={c.email}
                  >
                    {c.name}
                    {c.role || c.relation ? <span className="cust-email-chip-role"> · {c.relation || c.role}</span> : null}
                  </button>
                ))}
            </div>
          )}
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
              disabled={sending || !bodyText.trim() || !composeTo.trim()}
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
            const from = m.fromAddress.toLowerCase();
            const inbound = addresses.some((a) => a.email.toLowerCase() === from);
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
