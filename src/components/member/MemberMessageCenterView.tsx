'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { MessageAttachments } from '@/components/messages/MessageAttachments';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { isLocalPersistence } from '@/lib/persistence/config';
import {
  appendLocalCustomerMessage,
  listLocalCustomerMessages,
  listLocalCustomerThreads,
} from '@/lib/persistence/local-message-center';
import type {
  CustomerMessageThread,
} from '@/app/api/portal/message-center/route';
import type { TriageResult } from '@/app/api/portal/message-center/triage/route';
import { notifyActionCenterRefresh } from '@/lib/action-center-refresh';

const CANDID_PHONE = '815-207-8000';

const CATEGORY_LABELS: Record<string, string> = {
  all: 'All',
  bill_analysis: 'Bill analysis',
  supplier_issue: 'Suppliers',
  quote_request: 'Quotes',
  billing: 'Billing',
  technical: 'Technical',
  general: 'General',
};

type ChatMessage = { role: 'user' | 'assistant'; content: string };

type MentionMember = { handle: string; displayName: string };

function useAdminMentions() {
  const [members, setMembers] = useState<MentionMember[]>([]);
  useEffect(() => {
    void fetch('/api/portal/message-center/admins')
      .then((res) => (res.ok ? res.json() : { members: [] }))
      .then((data: { members?: MentionMember[] }) => setMembers(data.members ?? []))
      .catch(() => setMembers([]));
  }, []);
  return members;
}

function useMentionAutocomplete(members: MentionMember[]) {
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const suggestions = useMemo(() => {
    if (mentionQuery == null) return [];
    const q = mentionQuery.toLowerCase();
    return members
      .filter(
        (m) =>
          !q ||
          m.handle.toLowerCase().includes(q) ||
          m.displayName.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [mentionQuery, members]);

  const onDraftChange = (value: string, textarea: HTMLTextAreaElement | null) => {
    const caret = textarea?.selectionStart ?? value.length;
    const atMatch = value.slice(0, caret).match(/@([a-zA-Z0-9._-]*)$/);
    setMentionQuery(atMatch ? atMatch[1]! : null);
  };

  const insertMention = (
    member: MentionMember,
    draft: string,
    setDraft: (v: string) => void,
    textarea: HTMLTextAreaElement | null,
  ) => {
    const caret = textarea?.selectionStart ?? draft.length;
    const uptoCaret = draft.slice(0, caret);
    const afterCaret = draft.slice(caret);
    const atMatch = uptoCaret.match(/@([a-zA-Z0-9._-]*)$/);
    if (!atMatch) return;
    const start = caret - atMatch[0].length;
    const next = `${draft.slice(0, start)}@${member.handle} ${afterCaret}`;
    setDraft(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      if (!textarea) return;
      const pos = start + member.handle.length + 2;
      textarea.focus();
      textarea.setSelectionRange(pos, pos);
    });
  };

  return { mentionQuery, suggestions, onDraftChange, insertMention, clearMentions: () => setMentionQuery(null) };
}

async function runTriage(messages: ChatMessage[]): Promise<TriageResult | null> {
  try {
    const res = await fetch('/api/portal/message-center/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });
    if (!res.ok) return null;
    return (await res.json()) as TriageResult;
  } catch {
    return null;
  }
}

/** Customer Message Center with AI triage, attachments, and critical-issue
 *  guidance (TASK-022). */
export function MemberMessageCenterView({
  supplierContact,
  portalPreviewActive = false,
}: {
  supplierContact?: { name: string; phone?: string; email?: string };
  /** Admin portal preview — hide the previewing admin's personal message history. */
  portalPreviewActive?: boolean;
}) {
  const [threads, setThreads] = useState<CustomerMessageThread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [composing, setComposing] = useState(false);
  const mentionMembers = useAdminMentions();

  const refresh = useCallback(async () => {
    if (portalPreviewActive) {
      setThreads([]);
      return;
    }
    try {
      if (isLocalPersistence()) {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const localThreads = listLocalCustomerThreads(user.id);
        const msgs = listLocalCustomerMessages(localThreads.map((t) => t.id));
        const byThread = new Map<string, typeof msgs>();
        for (const m of msgs) {
          const arr = byThread.get(m.thread_id) ?? [];
          arr.push(m);
          byThread.set(m.thread_id, arr);
        }
        setThreads(
          localThreads.map((t) => ({
            ...t,
            messages: byThread.get(t.id) ?? [],
          })),
        );
        return;
      }

      const res = await fetch('/api/portal/message-center', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { threads?: CustomerMessageThread[] };
      setThreads(data.threads ?? []);
    } catch {
      /* offline */
    }
  }, [portalPreviewActive]);

  const handleSent = useCallback(async (threadId?: string) => {
    setComposing(false);
    if (threadId) setSelectedId(threadId);
    await refresh();
    if (threadId) setSelectedId(threadId);
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(
    () => (filter === 'all' ? threads : threads.filter((t) => t.category === filter)),
    [threads, filter],
  );
  const selected = threads.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="mc-root">
      <div className="mc-content">
        <aside className="mc-rail">
          <div className="mc-rail-brand">
            <span className="mc-rail-brand-title">Message Center</span>
            <span className="mc-rail-brand-sub">Talk with Candid about your account</span>
          </div>

          <button
            type="button"
            className="mc-new-go mc-rail-new"
            onClick={() => {
              setComposing(true);
              setSelectedId(null);
            }}
          >
            <AppIcon name="add" size={13} /> New message
          </button>

          <div className="mc-rail-section">
            <span>Filters</span>
          </div>
          <div className="mc-rail-filters">
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`mc-filter${filter === key ? ' active' : ''}`}
                onClick={() => setFilter(key)}
              >
                {label}
                {key !== 'all' && (
                  <span className="mc-filter-count">
                    {threads.filter((t) => t.category === key).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="mc-rail-section">
            <span>Conversations</span>
          </div>
          {filtered.length === 0 ? (
            <div className="mc-dm-empty">No messages yet.</div>
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`mc-rail-item mc-rail-thread${selectedId === t.id && !composing ? ' active' : ''}`}
                onClick={() => {
                  setSelectedId(t.id);
                  setComposing(false);
                }}
              >
                <div className="mc-rail-thread-top">
                  <span className="mc-rail-label">{t.subject || 'Message'}</span>
                  {t.critical ? <span className="mc-critical-pill">Critical</span> : null}
                </div>
                <span className="mc-rail-thread-meta">
                  {CATEGORY_LABELS[t.category] ?? t.category} · {t.status}
                </span>
              </button>
            ))
          )}
        </aside>

        <section className="mc-main">
          {composing ? (
            <MessageComposer
              supplierContact={supplierContact}
              mentionMembers={mentionMembers}
              onSent={(threadId) => void handleSent(threadId)}
              onCancel={() => setComposing(false)}
            />
          ) : selected ? (
            <ThreadView
              thread={selected}
              mentionMembers={mentionMembers}
              onRefresh={refresh}
              supplierContact={supplierContact}
            />
          ) : (
            <div className="mc-empty mc-empty-pane">
              <strong>Select a conversation</strong>
              <span>
                Pick a thread on the left or start a new message. Need us urgently? Call Candid at{' '}
                <strong>{CANDID_PHONE}</strong>.
              </span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ThreadView({
  thread,
  mentionMembers,
  onRefresh,
  supplierContact,
}: {
  thread: CustomerMessageThread;
  mentionMembers: MentionMember[];
  onRefresh: () => Promise<void>;
  supplierContact?: { name: string; phone?: string; email?: string };
}) {
  const [messages, setMessages] = useState(thread.messages);
  const [reply, setReply] = useState('');
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const replyFileRef = useRef<HTMLInputElement>(null);
  const { suggestions, onDraftChange, insertMention, clearMentions } = useMentionAutocomplete(mentionMembers);

  useEffect(() => {
    setMessages(thread.messages);
  }, [thread.id, thread.messages]);

  const send = async () => {
    if (!reply.trim() && replyFiles.length === 0) return;
    const body = reply.trim();
    const pendingFiles = [...replyFiles];
    setSending(true);
    setError('');
    const optimisticId = `local-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        thread_id: thread.id,
        author: 'customer' as const,
        body: body || (pendingFiles.length ? '(Attachment)' : ''),
        attachments: pendingFiles.map((f) => ({
          name: f.name,
          path: `local/${f.name}`,
          type: f.type || 'application/octet-stream',
        })),
        created_at: new Date().toISOString(),
      },
    ]);
    setReply('');
    setReplyFiles([]);
    try {
      if (isLocalPersistence()) {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error('not signed in');
        appendLocalCustomerMessage({
          userId: user.id,
          threadId: thread.id,
          body: body || (pendingFiles.length ? '(Attachment)' : ''),
          author: 'customer',
        });
      } else {
        const form = new FormData();
        form.set('threadId', thread.id);
        form.set('body', body || (pendingFiles.length ? '(Attachment)' : ''));
        form.set('author', 'customer');
        for (const f of pendingFiles) form.append('files', f);
        const res = await fetch('/api/portal/message-center', { method: 'POST', body: form });
        if (!res.ok) throw new Error('send failed');
      }
      clearMentions();
      await onRefresh();
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setReply(body);
      setReplyFiles(pendingFiles);
      setError('Could not send your reply. Please try again.');
    } finally {
      setSending(false);
    }
  };
  return (
    <>
      <header className="mc-header">
        <div className="mc-header-row">
          <div>
            <div className="mc-header-title">{thread.subject}</div>
            <div className="mc-header-sub">
              {CATEGORY_LABELS[thread.category] ?? thread.category} · {thread.status}
              {thread.supplier_name ? ` · ${thread.supplier_name}` : ''}
            </div>
          </div>
          {thread.critical ? <span className="mc-critical-pill">Critical</span> : null}
        </div>
      </header>
      {thread.critical && (
        <div className="mc-critical-banner">
          <div className="mc-critical-title">
            <AppIcon name="alerts" size={14} /> This looks urgent
          </div>
          <p>
            For anything critical, call Candid now at{' '}
            <a href={`tel:${CANDID_PHONE}`}>
              <strong>{CANDID_PHONE}</strong>
            </a>
            .
          </p>
          {(thread.supplier_name || supplierContact) && (
            <p className="mc-critical-supplier">
              Supplier: <strong>{thread.supplier_name || supplierContact?.name}</strong>
              {supplierContact?.phone ? ` · ${supplierContact.phone}` : ''}
              {supplierContact?.email ? ` · ${supplierContact.email}` : ''}
            </p>
          )}
        </div>
      )}
      <div className="mc-messages">
        {messages.length === 0 ? (
          <div className="mc-empty">
            <strong>No messages yet</strong>
            <span>Send a reply to continue this conversation.</span>
          </div>
        ) : (
          messages.map((m) => {
            const own = m.author === 'customer';
            const hank = m.author === 'ai';
            return (
              <div
                key={m.id}
                className={`mc-msg${own ? ' own' : ''}${hank ? ' hank' : ''}`}
              >
                <div className="mc-msg-avatar">
                  {hank ? <AppIcon name="hank" size={13} /> : own ? 'Y' : 'C'}
                </div>
                <div className="mc-msg-content">
                  <div className="mc-msg-meta">
                    <strong>{own ? 'You' : hank ? 'Hank' : 'Candid'}</strong>
                    {hank ? <span className="mc-ai-tag">AI</span> : null}
                  </div>
                  <div className="mc-msg-bubble">{m.body}</div>
                  <MessageAttachments attachments={m.attachments} />
                </div>
              </div>
            );
          })
        )}
      </div>
      {error && <div className="mc-error">{error}</div>}
      <div className="mc-composer">
        {suggestions.length > 0 && (
          <div className="mc-mention-menu">
            {suggestions.map((m) => (
              <button
                key={m.handle}
                type="button"
                className="mc-mention-opt"
                onClick={() => insertMention(m, reply, setReply, replyRef.current)}
              >
                <strong>@{m.handle}</strong>
                <span>{m.displayName}</span>
              </button>
            ))}
          </div>
        )}
        <div className="mc-composer-box">
          <textarea
            ref={replyRef}
            className="mc-input"
            value={reply}
            onChange={(e) => {
              setReply(e.target.value);
              onDraftChange(e.target.value, replyRef.current);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                clearMentions();
                void send();
              }
            }}
            rows={2}
            placeholder="Reply… type @ to mention a Candid admin"
          />
          {replyFiles.length > 0 ? (
            <div className="mc-attach-row">
              {replyFiles.map((f, i) => (
                <span key={`${f.name}-${i}`} className="mc-attach-chip">
                  <AppIcon name="file" size={11} /> {f.name}
                  <button
                    type="button"
                    aria-label="Remove"
                    onClick={() => setReplyFiles((prev) => prev.filter((_, j) => j !== i))}
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
              onClick={() => {
                clearMentions();
                void send();
              }}
              disabled={sending || (!reply.trim() && replyFiles.length === 0)}
            >
              <AppIcon name="send" size={13} /> {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function MessageComposer({
  supplierContact,
  mentionMembers,
  onSent,
  onCancel,
}: {
  supplierContact?: { name: string; phone?: string; email?: string };
  mentionMembers: MentionMember[];
  onSent: (threadId?: string) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<'quick' | 'guided'>('quick');
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [convo, setConvo] = useState<ChatMessage[]>([]);
  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const { suggestions, onDraftChange, insertMention, clearMentions } = useMentionAutocomplete(mentionMembers);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  };

  const persist = useCallback(
    async (result: TriageResult | null, fullConvo: ChatMessage[]): Promise<string | undefined> => {
      const userText = fullConvo.filter((m) => m.role === 'user').map((m) => m.content).join('\n\n');
      const subject = result?.summary?.slice(0, 80) || userText.slice(0, 80) || 'New message';

      if (isLocalPersistence()) {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error('not signed in');
        const threadId = appendLocalCustomerMessage({
          userId: user.id,
          subject,
          category: result?.category ?? 'general',
          critical: Boolean(result?.critical),
          supplierName: result?.supplierName ?? undefined,
          body: userText,
          author: 'customer',
        });
        if (result?.reply) {
          appendLocalCustomerMessage({
            userId: user.id,
            threadId,
            body: result.reply,
            author: 'ai',
          });
        }
        return threadId;
      }

      const form = new FormData();
      form.set('body', userText);
      form.set('author', 'customer');
      form.set('category', result?.category ?? 'general');
      form.set('critical', String(Boolean(result?.critical)));
      if (result?.supplierName) form.set('supplierName', result.supplierName);
      form.set('subject', subject);
      for (const f of files) form.append('files', f);
      const res = await fetch('/api/portal/message-center', { method: 'POST', body: form });
      if (!res.ok) throw new Error('send failed');
      const data = (await res.json()) as { threadId?: string };
      notifyActionCenterRefresh();
      if (data.threadId && result?.reply) {
        const aiForm = new FormData();
        aiForm.set('threadId', data.threadId);
        aiForm.set('author', 'ai');
        aiForm.set('body', result.reply);
        await fetch('/api/portal/message-center', { method: 'POST', body: aiForm }).catch(() => {});
      }
      return data.threadId;
    },
    [files],
  );

  // Quick send: triage, and only block if the AI says it genuinely needs more.
  const quickSend = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    setError('');
    const messages: ChatMessage[] = [{ role: 'user', content: draft.trim() }];
    const result = await runTriage(messages);
    if (result?.needsMoreInfo) {
      // Switch to guided so the customer can add the missing context.
      setConvo([...messages, { role: 'assistant', content: result.reply }]);
      setTriage(result);
      setMode('guided');
      setDraft('');
      setBusy(false);
      return;
    }
    try {
      const threadId = await persist(result, messages);
      setTriage(result);
      clearMentions();
      onSent(threadId);
    } catch {
      setError('Could not send your message. Please try again.');
    }
    setBusy(false);
  };

  // Guided turn: append, triage, and let the user keep going or send.
  const guidedSend = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    setError('');
    const next: ChatMessage[] = [...convo, { role: 'user', content: draft.trim() }];
    setConvo(next);
    setDraft('');
    const result = await runTriage(next);
    if (result) {
      setConvo([...next, { role: 'assistant', content: result.reply }]);
      setTriage(result);
    }
    setBusy(false);
  };

  const submitGuided = async () => {
    setBusy(true);
    setError('');
    try {
      const threadId = await persist(triage, convo);
      clearMentions();
      onSent(threadId);
    } catch {
      setError('Could not send your message. Please try again.');
    }
    setBusy(false);
  };

  return (
    <div className="mc-compose-pane">
      <header className="mc-header">
        <div className="mc-header-row">
          <div>
            <div className="mc-header-title">New message</div>
            <div className="mc-header-sub">Quick send or let Hank guide the details</div>
          </div>
          <div className="mc-mode-toggle">
            <button type="button" className={mode === 'quick' ? 'active' : ''} onClick={() => setMode('quick')}>
              Quick send
            </button>
            <button type="button" className={mode === 'guided' ? 'active' : ''} onClick={() => setMode('guided')}>
              Guided by Hank
            </button>
          </div>
          <button type="button" className="mc-icon-btn mc-text-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </header>

      {triage?.critical && (
        <div className="mc-critical-banner">
          <div className="mc-critical-title">
            <AppIcon name="alerts" size={14} /> This looks urgent
          </div>
          <p>
            For anything critical, call Candid now at{' '}
            <a href={`tel:${CANDID_PHONE}`}>
              <strong>{CANDID_PHONE}</strong>
            </a>
            .
          </p>
          {(triage.supplierName || supplierContact) && (
            <p className="mc-critical-supplier">
              Supplier: <strong>{triage.supplierName || supplierContact?.name}</strong>
              {supplierContact?.phone ? ` · ${supplierContact.phone}` : ''}
              {supplierContact?.email ? ` · ${supplierContact.email}` : ''}
            </p>
          )}
          <p className="mc-critical-q">
            Want us to submit a ticket directly to the supplier on your behalf? Note in your message
            whether Candid should manage it or you&apos;ll handle responses.
          </p>
        </div>
      )}

      {mode === 'guided' && convo.length > 0 && (
        <div className="mc-messages mc-guided">
          {convo.map((m, i) => {
            const own = m.role === 'user';
            return (
              <div key={i} className={`mc-msg${own ? ' own' : ' hank'}`}>
                <div className="mc-msg-avatar">{own ? 'Y' : <AppIcon name="hank" size={13} />}</div>
                <div className="mc-msg-content">
                  <div className="mc-msg-meta">
                    <strong>{own ? 'You' : 'Hank'}</strong>
                    {!own ? <span className="mc-ai-tag">AI</span> : null}
                  </div>
                  <div className="mc-msg-bubble">{m.content}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {triage && triage.suggestedActions.length > 0 && (
        <div className="mc-suggestions">
          {triage.suggestedActions.map((a, i) => (
            <span key={i} className="mc-suggestion-chip">
              {a}
            </span>
          ))}
        </div>
      )}

      <div className="mc-composer mc-composer--compose">
        {suggestions.length > 0 && (
          <div className="mc-mention-menu">
            {suggestions.map((m) => (
              <button
                key={m.handle}
                type="button"
                className="mc-mention-opt"
                onClick={() => insertMention(m, draft, setDraft, draftRef.current)}
              >
                <strong>@{m.handle}</strong>
                <span>{m.displayName}</span>
              </button>
            ))}
          </div>
        )}
        <div className="mc-composer-box">
          <textarea
            ref={draftRef}
            className="mc-input"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              onDraftChange(e.target.value, draftRef.current);
            }}
            rows={mode === 'guided' ? 2 : 5}
            placeholder={
              mode === 'guided'
                ? 'Add more detail… (@ to mention an admin)'
                : 'What can we help with? Type @ to mention a Candid admin…'
            }
          />
          {files.length > 0 && (
            <div className="mc-attach-row">
              {files.map((f, i) => (
                <span key={i} className="mc-attach-chip">
                  <AppIcon name="file" size={11} /> {f.name}
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          {error && <div className="mc-error">{error}</div>}
          <div className="mc-composer-toolbar">
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            <button type="button" className="mc-icon-btn mc-text-btn" onClick={() => fileRef.current?.click()}>
              <AppIcon name="file" size={11} /> Attach
            </button>
            <div className="mc-composer-actions-right">
              {mode === 'quick' ? (
                <button
                  type="button"
                  className="mc-send-btn"
                  onClick={() => void quickSend()}
                  disabled={busy || !draft.trim()}
                >
                  {busy ? 'Sending…' : 'Send'}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="mc-icon-btn mc-text-btn"
                    onClick={() => void guidedSend()}
                    disabled={busy || !draft.trim()}
                  >
                    {busy ? 'Thinking…' : 'Reply to Hank'}
                  </button>
                  <button
                    type="button"
                    className="mc-send-btn"
                    onClick={() => void submitGuided()}
                    disabled={busy || convo.length === 0}
                  >
                    <AppIcon name="send" size={13} /> Send to Candid
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
