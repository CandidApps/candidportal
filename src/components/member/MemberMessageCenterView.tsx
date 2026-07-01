'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { isLocalPersistence } from '@/lib/persistence/config';
import {
  listLocalCustomerMessages,
  listLocalCustomerThreads,
} from '@/lib/persistence/local-message-center';
import type {
  CustomerMessageThread,
} from '@/app/api/portal/message-center/route';
import type { TriageResult } from '@/app/api/portal/message-center/triage/route';

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
export function MemberMessageCenterView({ supplierContact }: { supplierContact?: { name: string; phone?: string; email?: string } }) {
  const [threads, setThreads] = useState<CustomerMessageThread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [composing, setComposing] = useState(false);

  const refresh = useCallback(async () => {
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

      const res = await fetch('/api/portal/message-center');
      if (!res.ok) return;
      const data = (await res.json()) as { threads?: CustomerMessageThread[] };
      setThreads(data.threads ?? []);
    } catch {
      /* offline */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(
    () => (filter === 'all' ? threads : threads.filter((t) => t.category === filter)),
    [threads, filter],
  );
  const selected = threads.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="mc-view">
      <div className="mc-sidebar">
        <button type="button" className="btn-primary mc-new-btn" onClick={() => { setComposing(true); setSelectedId(null); }}>
          <AppIcon name="add" size={13} /> New message
        </button>
        <div className="mc-filters">
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`mc-filter${filter === key ? ' active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
              {key !== 'all' && (
                <span className="mc-filter-count">{threads.filter((t) => t.category === key).length}</span>
              )}
            </button>
          ))}
        </div>
        <div className="mc-thread-list">
          {filtered.length === 0 ? (
            <div className="mc-empty-list">No messages yet.</div>
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`mc-thread-item${selectedId === t.id ? ' active' : ''}`}
                onClick={() => { setSelectedId(t.id); setComposing(false); }}
              >
                <div className="mc-thread-top">
                  <span className="mc-thread-subject">{t.subject || 'Message'}</span>
                  {t.critical && <span className="mc-critical-pill">Critical</span>}
                </div>
                <span className="mc-thread-cat">{CATEGORY_LABELS[t.category] ?? t.category} · {t.status}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="mc-main">
        {composing ? (
          <MessageComposer
            supplierContact={supplierContact}
            onSent={() => { setComposing(false); void refresh(); }}
            onCancel={() => setComposing(false)}
          />
        ) : selected ? (
          <ThreadView thread={selected} onRefresh={refresh} />
        ) : (
          <div className="mc-placeholder">
            <AppIcon name="messages" size={28} />
            <p>Select a conversation or start a new message.</p>
            <p className="mc-placeholder-sub">Need us urgently? Call Candid at <strong>{CANDID_PHONE}</strong>.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadView({ thread, onRefresh }: { thread: CustomerMessageThread; onRefresh: () => Promise<void> }) {
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const send = async () => {
    if (!reply.trim()) return;
    setSending(true);
    setError('');
    try {
      const form = new FormData();
      form.set('threadId', thread.id);
      form.set('body', reply.trim());
      form.set('author', 'customer');
      const res = await fetch('/api/portal/message-center', { method: 'POST', body: form });
      if (!res.ok) throw new Error('send failed');
      setReply('');
      await onRefresh();
    } catch {
      setError('Could not send your reply. Please try again.');
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="mc-thread-view">
      <div className="mc-thread-head">
        <div>
          <div className="mc-thread-title">{thread.subject}</div>
          <div className="mc-thread-meta">{CATEGORY_LABELS[thread.category] ?? thread.category} · {thread.status}{thread.supplier_name ? ` · ${thread.supplier_name}` : ''}</div>
        </div>
        {thread.critical && <span className="mc-critical-pill">Critical</span>}
      </div>
      <div className="mc-messages">
        {thread.messages.map((m) => (
          <div key={m.id} className={`mc-msg mc-msg--${m.author}`}>
            <div className="mc-msg-author">{m.author === 'customer' ? 'You' : m.author === 'ai' ? 'Hank' : 'Candid'}</div>
            <div className="mc-msg-body">{m.body}</div>
            {m.attachments?.length > 0 && (
              <div className="mc-msg-attachments">
                {m.attachments.map((a, i) => (
                  <span key={i} className="mc-attach-chip"><AppIcon name="file" size={11} /> {a.name}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {error && <div className="mc-error">{error}</div>}
      <div className="mc-reply-bar">
        <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="Reply…" />
        <button type="button" className="assist-mini-btn primary" onClick={() => void send()} disabled={sending || !reply.trim()}>
          <AppIcon name="send" size={11} /> {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

function MessageComposer({
  supplierContact,
  onSent,
  onCancel,
}: {
  supplierContact?: { name: string; phone?: string; email?: string };
  onSent: () => void;
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

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  };

  const persist = useCallback(
    async (result: TriageResult | null, fullConvo: ChatMessage[]) => {
      const userText = fullConvo.filter((m) => m.role === 'user').map((m) => m.content).join('\n\n');
      const form = new FormData();
      form.set('body', userText);
      form.set('author', 'customer');
      form.set('category', result?.category ?? 'general');
      form.set('critical', String(Boolean(result?.critical)));
      if (result?.supplierName) form.set('supplierName', result.supplierName);
      form.set('subject', result?.summary?.slice(0, 80) || userText.slice(0, 80) || 'New message');
      for (const f of files) form.append('files', f);
      const res = await fetch('/api/portal/message-center', { method: 'POST', body: form });
      if (!res.ok) throw new Error('send failed');
      const data = (await res.json()) as { threadId?: string };
      // Record Hank's reply as a thread message for continuity.
      if (data.threadId && result?.reply) {
        const aiForm = new FormData();
        aiForm.set('threadId', data.threadId);
        aiForm.set('author', 'ai');
        aiForm.set('body', result.reply);
        await fetch('/api/portal/message-center', { method: 'POST', body: aiForm }).catch(() => {});
      }
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
      await persist(result, messages);
      setTriage(result);
      if (result?.critical) {
        setConvo(messages);
        setBusy(false);
        return; // keep composer open to show critical guidance
      }
      onSent();
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
      await persist(triage, convo);
      if (triage?.critical) {
        setBusy(false);
        return;
      }
      onSent();
    } catch {
      setError('Could not send your message. Please try again.');
    }
    setBusy(false);
  };

  return (
    <div className="mc-composer">
      <div className="mc-composer-head">
        <div className="mc-mode-toggle">
          <button type="button" className={mode === 'quick' ? 'active' : ''} onClick={() => setMode('quick')}>Quick send</button>
          <button type="button" className={mode === 'guided' ? 'active' : ''} onClick={() => setMode('guided')}>Guided by Hank</button>
        </div>
        <button type="button" className="assist-mini-btn" onClick={onCancel}>Cancel</button>
      </div>

      {triage?.critical && (
        <div className="mc-critical-banner">
          <div className="mc-critical-title"><AppIcon name="alerts" size={14} /> This looks urgent</div>
          <p>For anything critical, call Candid now at <a href={`tel:${CANDID_PHONE}`}><strong>{CANDID_PHONE}</strong></a>.</p>
          {(triage.supplierName || supplierContact) && (
            <p className="mc-critical-supplier">
              Supplier: <strong>{triage.supplierName || supplierContact?.name}</strong>
              {supplierContact?.phone ? ` · ${supplierContact.phone}` : ''}
              {supplierContact?.email ? ` · ${supplierContact.email}` : ''}
            </p>
          )}
          <p className="mc-critical-q">Want us to submit a ticket directly to the supplier on your behalf? Note in your message whether Candid should manage it or you&apos;ll handle responses.</p>
        </div>
      )}

      {mode === 'guided' && convo.length > 0 && (
        <div className="mc-messages mc-guided">
          {convo.map((m, i) => (
            <div key={i} className={`mc-msg mc-msg--${m.role === 'user' ? 'customer' : 'ai'}`}>
              <div className="mc-msg-author">{m.role === 'user' ? 'You' : 'Hank'}</div>
              <div className="mc-msg-body">{m.content}</div>
            </div>
          ))}
        </div>
      )}

      {triage && triage.suggestedActions.length > 0 && (
        <div className="mc-suggestions">
          {triage.suggestedActions.map((a, i) => (
            <span key={i} className="mc-suggestion-chip">{a}</span>
          ))}
        </div>
      )}

      <div className="mc-composer-body">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={mode === 'guided' ? 2 : 5}
          placeholder={mode === 'guided' ? 'Add more detail…' : 'What can we help with? (issue with a supplier, a new quote, a billing question…)'}
        />
        {files.length > 0 && (
          <div className="mc-attach-row">
            {files.map((f, i) => (
              <span key={i} className="mc-attach-chip">
                <AppIcon name="file" size={11} /> {f.name}
                <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove">×</button>
              </span>
            ))}
          </div>
        )}
        {error && <div className="mc-error">{error}</div>}
        <div className="mc-composer-actions">
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} />
          <button type="button" className="assist-mini-btn" onClick={() => fileRef.current?.click()}>
            <AppIcon name="file" size={11} /> Attach
          </button>
          <div className="mc-composer-actions-right">
            {mode === 'quick' ? (
              <button type="button" className="assist-mini-btn primary" onClick={() => void quickSend()} disabled={busy || !draft.trim()}>
                {busy ? 'Sending…' : 'Send'}
              </button>
            ) : (
              <>
                <button type="button" className="assist-mini-btn" onClick={() => void guidedSend()} disabled={busy || !draft.trim()}>
                  {busy ? 'Thinking…' : 'Reply to Hank'}
                </button>
                <button type="button" className="assist-mini-btn primary" onClick={() => void submitGuided()} disabled={busy || convo.length === 0}>
                  <AppIcon name="send" size={11} /> Send to Candid
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
