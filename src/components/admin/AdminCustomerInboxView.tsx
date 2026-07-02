'use client';

import { useCallback, useEffect, useState } from 'react';

type CustomerThread = {
  id: string;
  user_id: string;
  subject: string | null;
  category: string;
  status: string;
  supplier_name: string | null;
  quote_request_id: string | null;
  analysis_review_id: string | null;
  updated_at: string;
  customer_name?: string;
  customer_email?: string;
  last_message?: {
    body: string;
    author: string;
    created_at: string;
  } | null;
};

type CustomerMessage = {
  id: string;
  author: string;
  body: string;
  created_at: string;
};

function authorLabel(author: string): string {
  if (author === 'customer') return 'Customer';
  if (author === 'ai') return 'Hank';
  if (author === 'team') return 'Candid team';
  return author;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function AdminCustomerInboxView({
  initialThreadId,
  onThreadChange,
  embedMode = false,
}: {
  initialThreadId?: string | null;
  onThreadChange?: () => void;
  embedMode?: boolean;
} = {}) {
  const [threads, setThreads] = useState<CustomerThread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CustomerMessage[]>([]);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const loadThreads = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/customer-messages/threads');
      const data = (await res.json()) as { threads?: CustomerThread[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load threads');
      setThreads(data.threads ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadThread = useCallback(async (id: string) => {
    setError('');
    try {
      const res = await fetch(`/api/admin/customer-messages/threads/${id}`);
      const data = (await res.json()) as { messages?: CustomerMessage[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load messages');
      setMessages(data.messages ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    }
  }, []);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (initialThreadId) setSelectedId(initialThreadId);
  }, [initialThreadId]);

  useEffect(() => {
    if (selectedId) void loadThread(selectedId);
    else setMessages([]);
  }, [selectedId, loadThread]);

  const sendReply = async () => {
    if (!selectedId || !reply.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/customer-messages/threads/${selectedId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: reply.trim(), notifyMember: true }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Send failed');
      setReply('');
      await loadThread(selectedId);
      await loadThreads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const selected = threads.find((t) => t.id === selectedId) ?? null;

  return (
    <div className={`admin-customer-inbox${embedMode ? ' admin-customer-inbox--embed' : ''}`}>
      {!embedMode ? (
        <div className="admin-customer-inbox-header">
          <h2 className="section-title">Customer messages</h2>
          <p className="text-muted">Reply to customer Message Center threads from the admin portal.</p>
        </div>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      <div className="admin-customer-inbox-layout">
        <div className="admin-customer-inbox-list">
          {loading ? <p>Loading…</p> : null}
          {!loading && !threads.length ? <p>No customer threads yet.</p> : null}
          {threads.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`admin-customer-inbox-row${selectedId === t.id ? ' admin-customer-inbox-row--active' : ''}`}
              onClick={() => setSelectedId(t.id)}
            >
              <div className="admin-customer-inbox-row-subject">{t.subject ?? 'Conversation'}</div>
              <div className="admin-customer-inbox-row-meta">
                {t.customer_name ?? 'Customer'}{t.customer_email ? ` · ${t.customer_email}` : ''} · {t.category} · {formatTime(t.updated_at)}
              </div>
              {t.last_message ? (
                <div className="admin-customer-inbox-row-preview">
                  {authorLabel(t.last_message.author)}: {t.last_message.body.slice(0, 80)}
                </div>
              ) : null}
            </button>
          ))}
        </div>
        <div className="admin-customer-inbox-detail">
          {!selected ? (
            <p className="text-muted">Select a thread to view and reply.</p>
          ) : (
            <>
              <div className="admin-customer-inbox-detail-header">
                <h3>{selected.subject ?? 'Conversation'}</h3>
                <div className="text-muted">
                  {selected.customer_name ?? 'Customer'}
                  {selected.customer_email ? ` · ${selected.customer_email}` : ''} · {selected.category}
                </div>
              </div>
              <div className="admin-customer-inbox-messages">
                {messages.length === 0 ? (
                  <p className="text-muted">No messages in this thread yet.</p>
                ) : null}
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`admin-customer-inbox-msg admin-customer-inbox-msg--${m.author}`}
                  >
                    <div className="admin-customer-inbox-msg-meta">{authorLabel(m.author)} · {formatTime(m.created_at)}</div>
                    <div className="admin-customer-inbox-msg-body">{m.body}</div>
                  </div>
                ))}
              </div>
              <div className="admin-customer-inbox-compose">
                <textarea
                  className="form-textarea"
                  rows={4}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Reply to customer…"
                />
                <button
                  type="button"
                  className="btn-primary"
                  disabled={sending || !reply.trim()}
                  onClick={() => void sendReply()}
                >
                  {sending ? 'Sending…' : 'Send reply'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
