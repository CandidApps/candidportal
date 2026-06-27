'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { callHankAPI, COMMISSIONS_ASSISTANT_PROMPT } from '@/lib/candid-data';
import {
  formatUserMessageDisplay,
  formatUserMessageWithAttachments,
} from '@/lib/chat-attachments';
import { ChatAttachmentChips, ChatAttachmentUploadButton } from '@/components/chat/ChatAttachmentControls';
import { useChatAttachments } from '@/components/chat/useChatAttachments';
import {
  appendSupplierGuidesToPrompt,
  formatSupplierGuidesForPrompt,
} from '@/lib/supplier-guides-context';
import { fetchAdminSupplierGuidesContext } from '@/lib/supplier-guides';
import {
  appendSupplierSourcesToPrompt,
  formatSupplierSourcesForPrompt,
} from '@/lib/supplier-sources-context';
import { fetchAdminSupplierSourcesContext } from '@/lib/supplier-sources';
import { addAssistantContext, type AssistantContextScope } from '@/lib/assistant/types';

type AssistantMsg = { type: 'user' | 'bot'; text: string; time: string };

const SUGGESTIONS = [
  'Summarize what I should check this month',
  'How do I add a new deal for an unmatched commission row?',
  'Open bank deposits reconciliation',
  'Which agents have unpaid commissions?',
  'Import Vendara commissions for June',
];

function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dispatchAssistantAction(detail: Record<string, string>) {
  window.dispatchEvent(new CustomEvent('candid-assistant-action', { detail }));
}

function runLocalActions(text: string, onNavigateCommissions: () => void): string | null {
  const lower = text.toLowerCase();

  if (
    /add.*(new )?deal|new deal|unmatched|tie.*deal|link.*deal/.test(lower)
  ) {
    onNavigateCommissions();
    dispatchAssistantAction({ action: 'focus-suppliers' });
    return 'Opened <strong>Commissions → Supplier reports</strong>. Expand a supplier and click <strong>New Deal(s)</strong> on any row that is not tied to the deal master. I can walk you through the fields if you tell me the customer name and supplier.';
  }

  if (/bank deposit|chase|reconcile|deposit match/.test(lower)) {
    onNavigateCommissions();
    dispatchAssistantAction({ action: 'focus-deposits' });
    return 'Opened <strong>Commissions → Bank Deposits</strong>. You can import Chase activity and match deposits to supplier totals there.';
  }

  if (/agent payout|unpaid agent|mark.*paid|agents tab/.test(lower)) {
    onNavigateCommissions();
    dispatchAssistantAction({ action: 'focus-agents' });
    return 'Opened <strong>Commissions → Agent payments</strong>. Review current-month owed, expand an agent for per-customer residuals, and mark payouts when complete.';
  }

  if (/open commissions|commissions tab|go to commissions/.test(lower)) {
    onNavigateCommissions();
    return 'Opened the <strong>Commissions</strong> tab.';
  }

  if (/manual upload|missing report|zero total/.test(lower)) {
    onNavigateCommissions();
    dispatchAssistantAction({ action: 'focus-suppliers' });
    return 'On <strong>Commissions → Supplier reports</strong>, suppliers with a <strong>$0</strong> total show a <strong>Manual upload</strong> action to import a missing commission report.';
  }

  return null;
}

export default function AdminAssistantPanel({
  onNavigateCommissions,
}: {
  onNavigateCommissions: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState<{ role: string; content: string }[]>([]);
  const [messages, setMessages] = useState<AssistantMsg[]>([
    {
      type: 'bot',
      time: 'Just now',
      text: "Hi — I'm Hank, your Candid assistant. I can help with anything across Candid: customers and accounts, research and recommendations, commissions, agent payouts, bank deposits, deals, and more. What do you need?",
    },
  ]);
  const [guidesPrompt, setGuidesPrompt] = useState('');
  const [sourcesPrompt, setSourcesPrompt] = useState('');
  const [training, setTraining] = useState(false);
  const [trainText, setTrainText] = useState('');
  const [trainScope, setTrainScope] = useState<AssistantContextScope>('personal');
  const [trainSaving, setTrainSaving] = useState(false);
  const [trainNotice, setTrainNotice] = useState('');
  const messagesRef = useRef<HTMLDivElement>(null);
  const {
    attachments,
    readyAttachments,
    processing: attachmentProcessing,
    addFiles,
    removeAttachment,
    clearAttachments,
    canAddMore,
  } = useChatAttachments();

  useEffect(() => {
    void (async () => {
      try {
        const guides = await fetchAdminSupplierGuidesContext();
        setGuidesPrompt(formatSupplierGuidesForPrompt(guides));
      } catch {
        setGuidesPrompt('');
      }
      try {
        const refs = await fetchAdminSupplierSourcesContext();
        setSourcesPrompt(formatSupplierSourcesForPrompt(refs));
      } catch {
        setSourcesPrompt('');
      }
    })();
  }, []);

  useEffect(() => {
    messagesRef.current?.scrollTo(0, messagesRef.current.scrollHeight);
  }, [messages, loading, open]);

  const send = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim();
      if ((!msg && !readyAttachments.length) || loading) return;
      setInput('');
      setLoading(true);

      const fullMessage = formatUserMessageWithAttachments(msg, attachments);
      const displayText = formatUserMessageDisplay(
        msg,
        readyAttachments.map((a) => a.name),
      );
      setMessages((prev) => [...prev, { type: 'user', text: displayText, time: now() }]);
      clearAttachments();

      const localReply = runLocalActions(msg, onNavigateCommissions);
      if (localReply && !readyAttachments.length) {
        setMessages((prev) => [...prev, { type: 'bot', text: localReply, time: now() }]);
        setLoading(false);
        return;
      }

      const historyWithUser = [...conversation, { role: 'user', content: fullMessage }];
      try {
        const reply = await callHankAPI(historyWithUser, {
          systemPrompt: appendSupplierSourcesToPrompt(
            appendSupplierGuidesToPrompt(COMMISSIONS_ASSISTANT_PROMPT, guidesPrompt),
            sourcesPrompt,
          ),
        });
        setConversation([...historyWithUser, { role: 'assistant', content: reply }]);
        setMessages((prev) => [...prev, { type: 'bot', text: reply, time: now() }]);
      } catch {
        const errText = "Something went wrong — try again in a moment.";
        setMessages((prev) => [...prev, { type: 'bot', text: errText, time: now() }]);
      } finally {
        setLoading(false);
      }
    },
    [attachments, clearAttachments, conversation, input, loading, onNavigateCommissions, guidesPrompt, sourcesPrompt, readyAttachments],
  );

  const saveTraining = useCallback(async () => {
    const fact = trainText.trim();
    if (!fact || trainSaving) return;
    setTrainSaving(true);
    setTrainNotice('');
    try {
      const subject = fact.split(/\s+/).slice(0, 6).join(' ');
      await addAssistantContext({ subject, info: fact, scope: trainScope });
      setTrainText('');
      setTrainNotice(
        trainScope === 'team' ? 'Saved — the whole team can use this.' : 'Saved to your private notes.',
      );
      setMessages((prev) => [
        ...prev,
        {
          type: 'bot',
          time: now(),
          text: `Got it — I'll remember that ${trainScope === 'team' ? 'for the whole team' : 'for you'}. 🧠`,
        },
      ]);
    } catch {
      setTrainNotice('Could not save — try again.');
    } finally {
      setTrainSaving(false);
    }
  }, [trainText, trainScope, trainSaving]);

  return (
    <div className={`assistant-fab-wrap${open ? ' assistant-fab-wrap--open' : ''}`}>
      {open && (
        <div className="assistant-panel" role="dialog" aria-label="Candid assistant">
          <div className="assistant-panel-header">
            <div className="assistant-panel-title">
              <span className="assistant-panel-icon" aria-hidden>
                <AppIcon name="hank" size={16} />
              </span>
              <div>
                <div className="assistant-panel-name">Hank — Candid Assistant</div>
                <div className="assistant-panel-sub">
                  Ask anything — customers, research, commissions, or portal actions
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                type="button"
                className={`assistant-train-toggle${training ? ' assistant-train-toggle--on' : ''}`}
                onClick={() => {
                  setTraining((t) => !t);
                  setTrainNotice('');
                }}
                title="Teach Hank something new"
              >
                {training ? 'Done' : 'Train Hank'}
              </button>
              <button
                type="button"
                className="assistant-panel-close"
                onClick={() => setOpen(false)}
                aria-label="Close assistant"
              >
                <AppIcon name="close" size={14} />
              </button>
            </div>
          </div>

          {training && (
            <div className="assistant-train">
              <div className="assistant-train-title">Teach Hank something</div>
              <p className="assistant-train-hint">
                Hank already knows your customers, agents, calendar, and mail. Add anything extra he
                should remember as a teammate.
              </p>
              <textarea
                className="assistant-train-input"
                value={trainText}
                onChange={(e) => setTrainText(e.target.value)}
                placeholder="e.g. Acme prefers we call before emailing. Renewals are handled by Dana."
                rows={3}
              />
              <div className="assistant-train-scope">
                <button
                  type="button"
                  className={`assistant-train-scope-btn${trainScope === 'personal' ? ' is-active' : ''}`}
                  onClick={() => setTrainScope('personal')}
                >
                  Just me
                </button>
                <button
                  type="button"
                  className={`assistant-train-scope-btn${trainScope === 'team' ? ' is-active' : ''}`}
                  onClick={() => setTrainScope('team')}
                >
                  Whole team
                </button>
                <button
                  type="button"
                  className="assistant-train-save"
                  onClick={() => void saveTraining()}
                  disabled={trainSaving || !trainText.trim()}
                >
                  {trainSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
              {trainNotice && <div className="assistant-train-notice">{trainNotice}</div>}
            </div>
          )}

          <div className="assistant-panel-messages" ref={messagesRef}>
            {messages.map((m, i) => (
              <div key={i} className={`assistant-msg assistant-msg--${m.type}`}>
                <div
                  className="assistant-msg-bubble"
                  dangerouslySetInnerHTML={{ __html: m.text }}
                />
                <div className="assistant-msg-time">{m.time}</div>
              </div>
            ))}
            {loading && (
              <div className="assistant-msg assistant-msg--bot">
                <div className="assistant-msg-bubble">
                  <div className="typing"><span /><span /><span /></div>
                </div>
              </div>
            )}
          </div>

          <div className="assistant-panel-suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="assistant-chip" onClick={() => void send(s)}>
                {s}
              </button>
            ))}
          </div>

          <ChatAttachmentChips
            attachments={attachments}
            onRemoveAttachment={removeAttachment}
            variant="assistant"
          />

          <div className="assistant-panel-input-row">
            <ChatAttachmentUploadButton
              processing={attachmentProcessing}
              canAddMore={canAddMore}
              onAddFiles={addFiles}
              variant="assistant"
            />
            <input
              className="assistant-panel-input"
              placeholder="Ask Hank anything — customers, research, commissions, deposits…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void send()}
              disabled={loading}
            />
            <button
              type="button"
              className="assistant-panel-send"
              onClick={() => void send()}
              disabled={loading || attachmentProcessing || (!input.trim() && !readyAttachments.length)}
              aria-label="Send"
            >
              <AppIcon name="send" size={14} />
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className="assistant-fab"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close commissions assistant' : 'Open commissions assistant'}
        title="Ask Hank about commissions"
      >
        <span className="assistant-fab-icon" aria-hidden>
          <AppIcon name="hank" size={18} />
        </span>
        <span className="assistant-fab-label">{open ? 'Close' : 'Ask Hank'}</span>
      </button>
    </div>
  );
}
