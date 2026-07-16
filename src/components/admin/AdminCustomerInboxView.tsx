'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { MessageAttachments } from '@/components/messages/MessageAttachments';
import {
  createAdminCustomerMessageThread,
  CUSTOMER_MESSAGE_CATEGORY_FILTERS,
  customerMessageCategoryLabel,
  customerMessageThreadTitle,
  isCustomerMessageThreadArchived,
  isCustomerMessageThreadUnread,
  patchCustomerMessageThreadArchive,
  patchCustomerMessageThreadRead,
  replyAdminCustomerMessageThread,
} from '@/lib/services/customer-message-threads';
import type { CustomerMessageAttachment } from '@/lib/customer-message-attachments';

type CustomerThread = {
  id: string;
  user_id: string;
  subject: string | null;
  category: string;
  status: string;
  supplier_name: string | null;
  updated_at: string;
  admin_read_at?: string | null;
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
  isNew?: boolean;
  attachments?: CustomerMessageAttachment[];
};

type PortalRecipient = {
  name: string;
  email: string;
  org: string | null;
};

type SortMode = 'newest' | 'oldest' | 'name';
type ListScope = 'active' | 'archived';

function authorLabel(author: string): string {
  if (author === 'customer') return 'Customer';
  if (author === 'ai') return 'Hank';
  if (author === 'team') return 'You';
  return author;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function avatarLetter(author: string, customerName?: string): string {
  if (author === 'ai') return 'H';
  if (author === 'team') return 'Y';
  const name = customerName?.trim();
  return (name?.charAt(0) || 'C').toUpperCase();
}

export function AdminCustomerInboxView({
  initialThreadId,
  onThreadsUpdated,
}: {
  initialThreadId?: string | null;
  onThreadChange?: () => void;
  onThreadsUpdated?: () => void;
  embedMode?: boolean;
} = {}) {
  const [threads, setThreads] = useState<CustomerThread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CustomerMessage[]>([]);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [listScope, setListScope] = useState<ListScope>('active');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [composing, setComposing] = useState(false);
  const [composeQuery, setComposeQuery] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeCategory, setComposeCategory] = useState('general');
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [composeFiles, setComposeFiles] = useState<File[]>([]);
  const [recipients, setRecipients] = useState<PortalRecipient[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<PortalRecipient | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const replyFileRef = useRef<HTMLInputElement>(null);
  const composeFileRef = useRef<HTMLInputElement>(null);

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
      const data = (await res.json()) as {
        thread?: CustomerThread;
        messages?: CustomerMessage[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Failed to load messages');
      setMessages(data.messages ?? []);
      if (data.thread) {
        setThreads((prev) =>
          prev.map((t) => (t.id === id ? { ...t, ...data.thread } : t)),
        );
        onThreadsUpdated?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    }
  }, [onThreadsUpdated]);

  const searchRecipients = useCallback(async (q: string) => {
    try {
      const res = await fetch(
        `/api/admin/contacts/search?q=${encodeURIComponent(q)}&all=${q.trim() ? '0' : '1'}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        contacts?: Array<{ name: string; email: string; org: string | null; type: string }>;
      };
      setRecipients(
        (data.contacts ?? [])
          .filter((c) => c.type === 'account')
          .slice(0, 40)
          .map((c) => ({ name: c.name, email: c.email, org: c.org })),
      );
    } catch {
      setRecipients([]);
    }
  }, []);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (initialThreadId) {
      setComposing(false);
      setSelectedId(initialThreadId);
      setListScope('active');
    }
  }, [initialThreadId]);

  useEffect(() => {
    if (selectedId && !composing) {
      void loadThread(selectedId);
    } else {
      setMessages([]);
    }
  }, [selectedId, loadThread, composing]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, selectedId]);

  useEffect(() => {
    if (!composing) return;
    const handle = window.setTimeout(() => void searchRecipients(composeQuery), 200);
    return () => window.clearTimeout(handle);
  }, [composing, composeQuery, searchRecipients]);

  const sortedScoped = useMemo(() => {
    const scoped = threads.filter((t) => {
      const scopeOk =
        listScope === 'archived'
          ? isCustomerMessageThreadArchived(t)
          : !isCustomerMessageThreadArchived(t);
      if (!scopeOk) return false;
      if (categoryFilter === 'all') return true;
      return t.category === categoryFilter;
    });
    const copy = [...scoped];
    copy.sort((a, b) => {
      if (sortMode === 'name') {
        return (a.customer_name ?? '').localeCompare(b.customer_name ?? '', undefined, {
          sensitivity: 'base',
        });
      }
      const av = new Date(a.updated_at).getTime();
      const bv = new Date(b.updated_at).getTime();
      return sortMode === 'oldest' ? av - bv : bv - av;
    });
    return copy;
  }, [threads, listScope, sortMode, categoryFilter]);

  const categoryCounts = useMemo(() => {
    const base = threads.filter((t) =>
      listScope === 'archived'
        ? isCustomerMessageThreadArchived(t)
        : !isCustomerMessageThreadArchived(t),
    );
    const counts: Record<string, number> = { all: base.length };
    for (const t of base) {
      counts[t.category] = (counts[t.category] ?? 0) + 1;
    }
    return counts;
  }, [threads, listScope]);

  const newThreads = useMemo(
    () => sortedScoped.filter((t) => isCustomerMessageThreadUnread(t)),
    [sortedScoped],
  );
  const existingThreads = useMemo(
    () => sortedScoped.filter((t) => !isCustomerMessageThreadUnread(t)),
    [sortedScoped],
  );

  const selected = threads.find((t) => t.id === selectedId) ?? null;
  const selectedUnread = selected ? isCustomerMessageThreadUnread(selected) : false;
  const selectedArchived = selected ? isCustomerMessageThreadArchived(selected) : false;
  const unreadCount = threads.filter((t) => isCustomerMessageThreadUnread(t)).length;

  const sendReply = async () => {
    if (!selectedId || sending) return;
    if (!reply.trim() && replyFiles.length === 0) return;
    setSending(true);
    setError('');
    try {
      const result = await replyAdminCustomerMessageThread({
        threadId: selectedId,
        body: reply.trim(),
        notifyMember: true,
        files: replyFiles,
      });
      if ('error' in result) throw new Error(result.error);
      setReply('');
      setReplyFiles([]);
      await loadThread(selectedId);
      await loadThreads();
      onThreadsUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const markUnread = async () => {
    if (!selectedId || busy) return;
    setBusy(true);
    setError('');
    try {
      const ok = await patchCustomerMessageThreadRead(selectedId, false);
      if (!ok) throw new Error('Could not mark unread');
      setThreads((prev) =>
        prev.map((t) => (t.id === selectedId ? { ...t, admin_read_at: null } : t)),
      );
      onThreadsUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark unread');
    } finally {
      setBusy(false);
    }
  };

  const toggleArchive = async () => {
    if (!selectedId || busy) return;
    setBusy(true);
    setError('');
    try {
      const next = !selectedArchived;
      const ok = await patchCustomerMessageThreadArchive(selectedId, next);
      if (!ok) throw new Error(next ? 'Could not archive' : 'Could not restore');
      setThreads((prev) =>
        prev.map((t) =>
          t.id === selectedId ? { ...t, status: next ? 'archived' : 'open' } : t,
        ),
      );
      if (next) {
        setSelectedId(null);
        setMessages([]);
      } else {
        setListScope('active');
        await loadThread(selectedId);
      }
      onThreadsUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archive failed');
    } finally {
      setBusy(false);
    }
  };

  const startConversation = async () => {
    if (!selectedRecipient || sending) return;
    if (!composeBody.trim() && composeFiles.length === 0) return;
    setSending(true);
    setError('');
    try {
      const result = await createAdminCustomerMessageThread({
        email: selectedRecipient.email,
        body: composeBody.trim(),
        subject: composeSubject.trim() || undefined,
        category: composeCategory,
        notifyMember: true,
        files: composeFiles,
      });
      if ('error' in result) throw new Error(result.error);
      setComposing(false);
      setComposeBody('');
      setComposeSubject('');
      setComposeCategory('general');
      setComposeFiles([]);
      setComposeQuery('');
      setSelectedRecipient(null);
      await loadThreads();
      setListScope('active');
      setSelectedId(result.threadId);
      onThreadsUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start conversation');
    } finally {
      setSending(false);
    }
  };

  const renderThreadButton = (t: CustomerThread) => {
    const unread = isCustomerMessageThreadUnread(t);
    const title = customerMessageThreadTitle({
      customer_name: t.customer_name ?? 'Customer',
      subject: t.subject,
      category: t.category,
    });
    return (
      <button
        key={t.id}
        type="button"
        className={`mc-rail-item mc-rail-thread${selectedId === t.id && !composing ? ' active' : ''}${unread ? ' unread' : ''}`}
        onClick={() => {
          setComposing(false);
          setSelectedId(t.id);
        }}
      >
        <div className="mc-rail-thread-top">
          <span className="mc-rail-label">{title}</span>
          {unread ? <span className="mc-unread-dot" /> : null}
        </div>
        <span className="mc-rail-thread-meta">
          {t.customer_email || 'No email'} · {customerMessageCategoryLabel(t.category)}
        </span>
        <span className="mc-rail-thread-meta">{formatTime(t.updated_at)}</span>
      </button>
    );
  };

  return (
    <div className="mc-root">
      <div className="mc-content">
        <aside className="mc-rail">
          <div className="mc-rail-brand">
            <span className="mc-rail-brand-title">Customer messages</span>
            <span className="mc-rail-brand-sub">
              {unreadCount > 0 ? `${unreadCount} new` : 'Inbox with portal customers'}
            </span>
          </div>

          <button
            type="button"
            className="mc-new-go mc-rail-new"
            onClick={() => {
              setComposing(true);
              setSelectedId(null);
              setError('');
            }}
          >
            <AppIcon name="add" size={13} /> Message a customer
          </button>

          <div className="mc-rail-filters">
            <button
              type="button"
              className={`mc-filter${listScope === 'active' ? ' active' : ''}`}
              onClick={() => setListScope('active')}
            >
              Active
            </button>
            <button
              type="button"
              className={`mc-filter${listScope === 'archived' ? ' active' : ''}`}
              onClick={() => setListScope('archived')}
            >
              Archived
            </button>
          </div>

          <div className="mc-rail-section">
            <span>Type</span>
          </div>
          <div className="mc-rail-filters">
            {CUSTOMER_MESSAGE_CATEGORY_FILTERS.map(({ key, label }) => {
              const count = categoryCounts[key] ?? 0;
              return (
                <button
                  key={key}
                  type="button"
                  className={`mc-filter${categoryFilter === key ? ' active' : ''}`}
                  onClick={() => setCategoryFilter(key)}
                >
                  {label}
                  {count > 0 ? <span className="mc-filter-count">{count}</span> : null}
                </button>
              );
            })}
          </div>

          <div className="mc-rail-section">
            <span>Sort</span>
          </div>
          <div className="mc-rail-filters">
            <button
              type="button"
              className={`mc-filter${sortMode === 'newest' ? ' active' : ''}`}
              onClick={() => setSortMode('newest')}
            >
              Newest
            </button>
            <button
              type="button"
              className={`mc-filter${sortMode === 'oldest' ? ' active' : ''}`}
              onClick={() => setSortMode('oldest')}
            >
              Oldest
            </button>
            <button
              type="button"
              className={`mc-filter${sortMode === 'name' ? ' active' : ''}`}
              onClick={() => setSortMode('name')}
            >
              A–Z
            </button>
          </div>

          {loading ? <div className="mc-dm-empty">Loading…</div> : null}

          {!loading && sortedScoped.length === 0 ? (
            <div className="mc-dm-empty">
              {listScope === 'archived'
                ? 'No archived conversations in this type.'
                : categoryFilter === 'all'
                  ? 'No active conversations yet.'
                  : `No ${customerMessageCategoryLabel(categoryFilter).toLowerCase()} conversations.`}
            </div>
          ) : null}

          {listScope === 'active' && newThreads.length > 0 ? (
            <>
              <div className="mc-rail-section">
                <span>New</span>
                <span className="mc-badge">{newThreads.length}</span>
              </div>
              {newThreads.map(renderThreadButton)}
            </>
          ) : null}

          {listScope === 'active' && existingThreads.length > 0 ? (
            <>
              <div className="mc-rail-section">
                <span>Existing</span>
              </div>
              {existingThreads.map(renderThreadButton)}
            </>
          ) : null}

          {listScope === 'archived'
            ? sortedScoped.map(renderThreadButton)
            : null}
        </aside>

        <section className="mc-main">
          {composing ? (
            <div className="mc-compose-pane">
              <header className="mc-header">
                <div className="mc-header-title">Message a customer</div>
                <div className="mc-header-sub">
                  Starts a new portal Message Center conversation and notifies them.
                </div>
              </header>
              <div className="mc-compose-form">
                <label className="mc-compose-field">
                  <span>Customer</span>
                  <input
                    className="mc-new-input"
                    value={
                      selectedRecipient
                        ? `${selectedRecipient.name} <${selectedRecipient.email}>`
                        : composeQuery
                    }
                    onChange={(e) => {
                      setSelectedRecipient(null);
                      setComposeQuery(e.target.value);
                    }}
                    placeholder="Search by name or email…"
                  />
                </label>
                {!selectedRecipient && recipients.length > 0 ? (
                  <div className="mc-compose-picker">
                    {recipients.map((r) => (
                      <button
                        key={r.email}
                        type="button"
                        className="mc-dm-option"
                        onClick={() => {
                          setSelectedRecipient(r);
                          setComposeQuery('');
                        }}
                      >
                        <strong>{r.name}</strong>
                        <span>
                          {r.email}
                          {r.org ? ` · ${r.org}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <label className="mc-compose-field">
                  <span>Subject (optional)</span>
                  <input
                    className="mc-new-input"
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                    placeholder="Shown in the customer portal"
                  />
                </label>
                <label className="mc-compose-field">
                  <span>Type</span>
                  <select
                    className="mc-new-input"
                    value={composeCategory}
                    onChange={(e) => setComposeCategory(e.target.value)}
                  >
                    {CUSTOMER_MESSAGE_CATEGORY_FILTERS.filter((c) => c.key !== 'all').map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mc-compose-field">
                  <span>Message</span>
                  <textarea
                    className="mc-input mc-compose-textarea"
                    rows={5}
                    value={composeBody}
                    onChange={(e) => setComposeBody(e.target.value)}
                    placeholder="Write your message…"
                  />
                </label>
                {composeFiles.length > 0 ? (
                  <div className="mc-attach-row">
                    {composeFiles.map((f, i) => (
                      <span key={`${f.name}-${i}`} className="mc-attach-chip">
                        <AppIcon name="file" size={11} /> {f.name}
                        <button
                          type="button"
                          aria-label="Remove"
                          onClick={() =>
                            setComposeFiles((prev) => prev.filter((_, j) => j !== i))
                          }
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
                {error ? <div className="mc-error">{error}</div> : null}
                <div className="mc-composer-toolbar">
                  <input
                    ref={composeFileRef}
                    type="file"
                    multiple
                    hidden
                    onChange={(e) => {
                      const list = e.target.files;
                      if (!list) return;
                      setComposeFiles((prev) => [...prev, ...Array.from(list)]);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    className="mc-icon-btn mc-text-btn"
                    onClick={() => composeFileRef.current?.click()}
                  >
                    <AppIcon name="file" size={12} /> Attach
                  </button>
                  <button
                    type="button"
                    className="mc-icon-btn mc-text-btn"
                    onClick={() => {
                      setComposing(false);
                      setError('');
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="mc-send-btn"
                    disabled={
                      sending ||
                      !selectedRecipient ||
                      (!composeBody.trim() && composeFiles.length === 0)
                    }
                    onClick={() => void startConversation()}
                  >
                    <AppIcon name="send" size={13} /> {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          ) : !selected ? (
            <div className="mc-empty mc-empty-pane">
              <strong>Select a conversation</strong>
              <span>Pick a thread on the left, or message a customer to start one.</span>
            </div>
          ) : (
            <>
              <header className="mc-header">
                <div className="mc-header-row">
                  <div>
                    <div className="mc-header-title">
                      {customerMessageThreadTitle({
                        customer_name: selected.customer_name ?? 'Customer',
                        subject: selected.subject,
                        category: selected.category,
                      })}
                    </div>
                    <div className="mc-header-sub">
                      {selected.customer_email || 'No email'} ·{' '}
                      {customerMessageCategoryLabel(selected.category)}
                      {selected.supplier_name ? ` · ${selected.supplier_name}` : ''}
                    </div>
                  </div>
                  <div className="mc-header-actions">
                    {selectedUnread ? (
                      <span className="mc-unread-pill">New</span>
                    ) : (
                      <button
                        type="button"
                        className="mc-icon-btn mc-text-btn"
                        disabled={busy || selectedArchived}
                        onClick={() => void markUnread()}
                      >
                        Mark unread
                      </button>
                    )}
                    <button
                      type="button"
                      className="mc-icon-btn mc-text-btn"
                      disabled={busy}
                      onClick={() => void toggleArchive()}
                    >
                      {selectedArchived ? 'Restore' : 'Archive'}
                    </button>
                  </div>
                </div>
              </header>

              <div className="mc-messages" ref={listRef}>
                {messages.length === 0 ? (
                  <div className="mc-empty">
                    <strong>No messages yet</strong>
                    <span>Send a reply to start the conversation.</span>
                  </div>
                ) : (
                  messages.map((m) => {
                    const own = m.author === 'team';
                    const hank = m.author === 'ai';
                    const isNew = Boolean(m.isNew);
                    return (
                      <div
                        key={m.id}
                        className={`mc-msg${own ? ' own' : ''}${hank ? ' hank' : ''}${isNew ? ' is-new' : ''}`}
                      >
                        <div className="mc-msg-avatar">
                          {hank ? (
                            <AppIcon name="hank" size={13} />
                          ) : (
                            avatarLetter(m.author, selected.customer_name)
                          )}
                        </div>
                        <div className="mc-msg-content">
                          <div className="mc-msg-meta">
                            <strong>{authorLabel(m.author)}</strong>
                            {hank ? <span className="mc-ai-tag">AI</span> : null}
                            {isNew ? <span className="mc-new-tag">New</span> : null}
                            <span>{formatTime(m.created_at)}</span>
                          </div>
                          <div className="mc-msg-bubble">{m.body}</div>
                          <MessageAttachments attachments={m.attachments} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {error ? <div className="mc-error">{error}</div> : null}

              {!selectedArchived ? (
                <div className="mc-composer">
                  <div className="mc-composer-box">
                    <textarea
                      className="mc-input"
                      rows={2}
                      value={reply}
                      disabled={sending}
                      placeholder="Reply to customer…"
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void sendReply();
                        }
                      }}
                    />
                    {replyFiles.length > 0 ? (
                      <div className="mc-attach-row">
                        {replyFiles.map((f, i) => (
                          <span key={`${f.name}-${i}`} className="mc-attach-chip">
                            <AppIcon name="file" size={11} /> {f.name}
                            <button
                              type="button"
                              aria-label="Remove"
                              onClick={() =>
                                setReplyFiles((prev) => prev.filter((_, j) => j !== i))
                              }
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="mc-composer-toolbar">
                      <input
                        ref={replyFileRef}
                        type="file"
                        multiple
                        hidden
                        onChange={(e) => {
                          const list = e.target.files;
                          if (!list) return;
                          setReplyFiles((prev) => [...prev, ...Array.from(list)]);
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        className="mc-icon-btn mc-text-btn"
                        disabled={sending}
                        onClick={() => replyFileRef.current?.click()}
                      >
                        <AppIcon name="file" size={12} /> Attach
                      </button>
                      <span className="mc-composer-hint">Enter to send · Shift+Enter for new line</span>
                      <button
                        type="button"
                        className="mc-send-btn"
                        disabled={sending || (!reply.trim() && replyFiles.length === 0)}
                        onClick={() => void sendReply()}
                      >
                        <AppIcon name="send" size={13} /> {sending ? 'Sending…' : 'Send'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mc-composer">
                  <div className="mc-archived-banner">
                    This conversation is archived. Restore it to reply.
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
