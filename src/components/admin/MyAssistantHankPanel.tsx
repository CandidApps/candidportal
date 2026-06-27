'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import {
  addAssistantContext,
  sendAssistantChat,
  type AssistantContextScope,
} from '@/lib/assistant/types';

type ChatMsg = { type: 'user' | 'bot'; text: string; time: string };

function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const STARTERS = [
  'What should I tackle first today?',
  'Summarize my open portal tickets',
  'Who am I waiting on for replies?',
];

export function MyAssistantHankPanel() {
  const [open, setOpen] = useState(false);
  const [training, setTraining] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      type: 'bot',
      time: 'Just now',
      text: "I'm Hank — I already know your customers, calendar, mail, and portal data. Ask me anything or train me on something extra.",
    },
  ]);
  const [trainText, setTrainText] = useState('');
  const [trainScope, setTrainScope] = useState<AssistantContextScope>('personal');
  const [trainSaving, setTrainSaving] = useState(false);
  const [trainNotice, setTrainNotice] = useState('');
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only auto-scroll the message list on new messages — not when the trainer
    // panel toggles open, which previously yanked the view down too far.
    messagesRef.current?.scrollTo(0, messagesRef.current.scrollHeight);
  }, [messages, loading]);

  const send = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim();
      if (!msg || loading) return;
      setInput('');
      setLoading(true);
      setMessages((prev) => [...prev, { type: 'user', text: msg, time: now() }]);
      const historyWithUser = [...conversation, { role: 'user' as const, content: msg }];
      try {
        const { message } = await sendAssistantChat(historyWithUser);
        setConversation([...historyWithUser, { role: 'assistant', content: message }]);
        setMessages((prev) => [...prev, { type: 'bot', text: message, time: now() }]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { type: 'bot', text: 'Something went wrong — try again in a moment.', time: now() },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [conversation, input, loading],
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
        trainScope === 'team' ? 'Saved for the whole team.' : 'Saved for you only.',
      );
      setMessages((prev) => [
        ...prev,
        {
          type: 'bot',
          time: now(),
          text: `Got it — I'll remember that ${trainScope === 'team' ? 'for everyone on the team' : 'just for you'}.`,
        },
      ]);
    } catch {
      setTrainNotice('Could not save — try again.');
    } finally {
      setTrainSaving(false);
    }
  }, [trainText, trainScope, trainSaving]);

  return (
    <div className={`assistant-fab-wrap assist-hank-fab${open ? ' assistant-fab-wrap--open' : ''}`}>
      {open && (
        <div className="assistant-panel" role="dialog" aria-label="MyAssistant Hank">
          <div className="assistant-panel-header">
            <div className="assistant-panel-title">
              <span className="assistant-panel-icon" aria-hidden>
                <AppIcon name="hank" size={16} />
              </span>
              <div>
                <div className="assistant-panel-name">Hank</div>
                <div className="assistant-panel-sub">Your work assistant</div>
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
              >
                {training ? 'Done' : 'Train me'}
              </button>
              <button
                type="button"
                className="assistant-panel-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <AppIcon name="close" size={14} />
              </button>
            </div>
          </div>

          {training && (
            <div className="assistant-train">
              <div className="assistant-train-title">Teach Hank something new</div>
              <p className="assistant-train-hint">
                Hank already has portal, mail, and calendar access. Add team knowledge he should
                keep in mind.
              </p>
              <textarea
                className="assistant-train-input"
                value={trainText}
                onChange={(e) => setTrainText(e.target.value)}
                placeholder="e.g. Always CC Dana on Acme renewals. Their fiscal year ends in March."
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
                <div className="assistant-msg-bubble" dangerouslySetInnerHTML={{ __html: m.text }} />
                <div className="assistant-msg-time">{m.time}</div>
              </div>
            ))}
            {loading && (
              <div className="assistant-msg assistant-msg--bot">
                <div className="assistant-msg-bubble">
                  <div className="typing">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="assistant-panel-suggestions">
            {STARTERS.map((s) => (
              <button key={s} type="button" className="assistant-chip" onClick={() => void send(s)}>
                {s}
              </button>
            ))}
          </div>

          <div className="assistant-panel-input-row">
            <input
              className="assistant-panel-input"
              placeholder="Ask Hank about your day, customers, tasks…"
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
        aria-label={open ? 'Close Hank' : 'Ask Hank'}
      >
        <span className="assistant-fab-icon" aria-hidden>
          <AppIcon name="hank" size={18} />
        </span>
        <span className="assistant-fab-label">{open ? 'Close' : 'Ask Hank'}</span>
      </button>
    </div>
  );
}
