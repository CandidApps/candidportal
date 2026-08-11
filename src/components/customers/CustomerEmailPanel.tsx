'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchCustomerConversation,
  fetchMessageContent,
  type ConversationMessage,
} from '@/lib/email/client';
import {
  collectAccountMailContacts,
  launchAccountEmailCompose,
  type AccountComposeContact,
} from '@/lib/crm/account-compose';

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

type DirectionFilter = 'all' | 'received' | 'sent';

type EnrichedMessage = ConversationMessage & {
  lookupEmail: string;
  inbound: boolean;
};

export function CustomerEmailPanel({
  email,
  customerName,
  contacts = [],
  associatedContacts = [],
}: {
  email: string | undefined;
  customerName: string;
  contacts?: MailContact[];
  associatedContacts?: MailContact[];
}) {
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(true);
  const [mailbox, setMailbox] = useState<string | undefined>();
  const [messages, setMessages] = useState<EnrichedMessage[]>([]);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [contentById, setContentById] = useState<Record<string, string>>({});
  const [includeContacts, setIncludeContacts] = useState(false);
  const [search, setSearch] = useState('');
  const [contactFilter, setContactFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all');
  const [attachmentsOnly, setAttachmentsOnly] = useState(false);

  const accountContacts = useMemo((): AccountComposeContact[] => {
    const raw = collectAccountMailContacts(
      [...contacts, ...(includeContacts ? associatedContacts : [])].map((c) => ({
        name: c.name,
        email: c.email,
        role: c.role ?? c.relation,
      })),
    );
    if (email?.trim()) {
      const primary = { name: customerName, email: email.trim() };
      if (!raw.some((c) => c.email.toLowerCase() === primary.email.toLowerCase())) {
        return [primary, ...raw];
      }
    }
    return raw;
  }, [contacts, associatedContacts, includeContacts, email, customerName]);

  const addresses = useMemo(() => accountContacts, [accountContacts]);

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
      const byId = new Map<string, EnrichedMessage>();
      for (let i = 0; i < addresses.length; i++) {
        const lookupEmail = addresses[i].email;
        const r = results[i];
        if (!r) continue;
        for (const m of r.messages) {
          const from = m.fromAddress.toLowerCase();
          const inbound = addresses.some((a) => a.email.toLowerCase() === from);
          byId.set(m.messageId, { ...m, lookupEmail, inbound });
        }
      }
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

  const filteredMessages = useMemo(() => {
    const q = search.trim().toLowerCase();
    return messages.filter((m) => {
      if (attachmentsOnly && !m.hasAttachment) return false;
      if (directionFilter === 'received' && !m.inbound) return false;
      if (directionFilter === 'sent' && m.inbound) return false;
      if (contactFilter !== 'all') {
        const key = contactFilter.toLowerCase();
        const from = m.fromAddress.toLowerCase();
        if (from !== key && !m.sender.toLowerCase().includes(key)) return false;
      }
      if (!q) return true;
      return (
        m.subject.toLowerCase().includes(q) ||
        m.summary.toLowerCase().includes(q) ||
        m.sender.toLowerCase().includes(q) ||
        m.fromAddress.toLowerCase().includes(q)
      );
    });
  }, [messages, search, contactFilter, directionFilter, attachmentsOnly]);

  const toggleMessage = async (m: EnrichedMessage) => {
    if (expandedId === m.messageId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(m.messageId);
    if (!contentById[m.messageId]) {
      try {
        const content = await fetchMessageContent(m.lookupEmail, m.messageId, m.folderId);
        setContentById((prev) => ({ ...prev, [m.messageId]: content }));
      } catch {
        setContentById((prev) => ({ ...prev, [m.messageId]: '<em>Could not load message.</em>' }));
      }
    }
  };

  const openCompose = (opts?: { reply?: EnrichedMessage }) => {
    launchAccountEmailCompose({
      contextLabel: customerName,
      to: email,
      accountContacts,
      reply: opts?.reply
        ? {
            message: opts.reply,
            lookupEmail: opts.reply.lookupEmail,
            quotedHtml: contentById[opts.reply.messageId],
            inbound: opts.reply.inbound,
          }
        : undefined,
    });
  };

  const openReply = (m: EnrichedMessage) => {
    if (!contentById[m.messageId]) {
      void fetchMessageContent(m.lookupEmail, m.messageId, m.folderId).then((content) => {
        setContentById((prev) => ({ ...prev, [m.messageId]: content }));
        launchAccountEmailCompose({
          contextLabel: customerName,
          to: email,
          accountContacts,
          reply: {
            message: m,
            lookupEmail: m.lookupEmail,
            quotedHtml: content,
            inbound: m.inbound,
          },
        });
      });
      return;
    }
    openCompose({ reply: m });
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
        <div className="cust-email-mailbox">{mailbox ? `Mailbox: ${mailbox}` : ''}</div>
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
          <button type="button" className="admin-ticket-btn primary" onClick={() => openCompose()}>
            Compose
          </button>
        </div>
      </div>

      <div className="cust-email-filters">
        <input
          className="cust-email-filter-input"
          placeholder="Search subject, sender…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="cust-email-filter-select"
          value={contactFilter}
          onChange={(e) => setContactFilter(e.target.value)}
        >
          <option value="all">All contacts</option>
          {addresses.map((a) => (
            <option key={a.email} value={a.email}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          className="cust-email-filter-select"
          value={directionFilter}
          onChange={(e) => setDirectionFilter(e.target.value as DirectionFilter)}
        >
          <option value="all">Sent & received</option>
          <option value="received">Received</option>
          <option value="sent">Sent</option>
        </select>
        <label className="cust-email-toggle">
          <input
            type="checkbox"
            checked={attachmentsOnly}
            onChange={(e) => setAttachmentsOnly(e.target.checked)}
          />
          With attachments
        </label>
      </div>

      {error ? <div className="cust-email-error">{error}</div> : null}

      {loading && messages.length === 0 ? (
        <div className="cust-email-empty">Loading conversation…</div>
      ) : filteredMessages.length === 0 ? (
        <div className="cust-email-empty">
          {messages.length === 0 ? `No email found with ${email}.` : 'No messages match your filters.'}
        </div>
      ) : (
        <ul className="cust-email-list">
          {filteredMessages.map((m) => {
            const expanded = expandedId === m.messageId;
            return (
              <li key={m.messageId} className={`cust-email-item${expanded ? ' expanded' : ''}`}>
                <button type="button" className="cust-email-row" onClick={() => void toggleMessage(m)}>
                  <span className={`cust-email-dir ${m.inbound ? 'in' : 'out'}`}>
                    {m.inbound ? 'In' : 'Out'}
                  </span>
                  <span className="cust-email-meta">
                    <span className="cust-email-subject">
                      {m.subject}
                      {m.hasAttachment ? <span className="cust-email-attach-badge">📎</span> : null}
                    </span>
                    <span className="cust-email-sender">{m.sender || m.fromAddress}</span>
                  </span>
                  <span className="cust-email-time">{formatWhen(m.receivedTime || m.sentTime)}</span>
                </button>
                {expanded ? (
                  <div className="cust-email-body">
                    <div className="cust-email-body-actions">
                      <button type="button" className="admin-ticket-btn primary" onClick={() => openReply(m)}>
                        Reply
                      </button>
                    </div>
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
