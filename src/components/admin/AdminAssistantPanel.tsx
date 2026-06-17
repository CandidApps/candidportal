'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { callHankAPI, COMMISSIONS_ASSISTANT_PROMPT } from '@/lib/candid-data';

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
      text: 'Hi — I can help with commissions, agent payouts, bank deposits, and adding deals to the BMW master. What do you need?',
    },
  ]);
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesRef.current?.scrollTo(0, messagesRef.current.scrollHeight);
  }, [messages, loading, open]);

  const send = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim();
      if (!msg || loading) return;
      setInput('');
      setLoading(true);
      setMessages((prev) => [...prev, { type: 'user', text: msg, time: now() }]);

      const localReply = runLocalActions(msg, onNavigateCommissions);
      if (localReply) {
        setMessages((prev) => [...prev, { type: 'bot', text: localReply, time: now() }]);
        setLoading(false);
        return;
      }

      const historyWithUser = [...conversation, { role: 'user', content: msg }];
      try {
        const reply = await callHankAPI(historyWithUser, {
          systemPrompt: COMMISSIONS_ASSISTANT_PROMPT,
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
    [conversation, input, loading, onNavigateCommissions],
  );

  return (
    <div className={`assistant-fab-wrap${open ? ' assistant-fab-wrap--open' : ''}`}>
      {open && (
        <div className="assistant-panel" role="dialog" aria-label="Commissions assistant">
          <div className="assistant-panel-header">
            <div className="assistant-panel-title">
              <span className="assistant-panel-icon" aria-hidden>
                <AppIcon name="hank" size={16} />
              </span>
              <div>
                <div className="assistant-panel-name">Hank — Commissions</div>
                <div className="assistant-panel-sub">Ask questions or request portal actions</div>
              </div>
            </div>
            <button
              type="button"
              className="assistant-panel-close"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
            >
              <AppIcon name="close" size={14} />
            </button>
          </div>

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

          <div className="assistant-panel-input-row">
            <input
              className="assistant-panel-input"
              placeholder="Ask about commissions, agents, deposits, new deals…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void send()}
              disabled={loading}
            />
            <button
              type="button"
              className="assistant-panel-send"
              onClick={() => void send()}
              disabled={loading || !input.trim()}
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
