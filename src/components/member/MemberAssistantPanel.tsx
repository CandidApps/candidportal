'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { callHankAPI, HANK_SYSTEM_PROMPT } from '@/lib/candid-data';
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
import { fetchPortalSupplierGuides } from '@/lib/supplier-guides';

type AssistantMsg = { type: 'user' | 'bot'; text: string; time: string };

const SUGGESTIONS = [
  'What services are expiring soon?',
  'Where can I save money this month?',
  'Summarize my technology spend',
  'What should I do about my renewal?',
];

function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MemberAssistantPanel({
  vendorNames,
  hidden,
}: {
  vendorNames: string[];
  hidden?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState<{ role: string; content: string }[]>([]);
  const [messages, setMessages] = useState<AssistantMsg[]>([
    {
      type: 'bot',
      time: 'Just now',
      text: 'Hi — I\'m Hank. Ask about your services, contracts, savings opportunities, or supplier resources from your vendors.',
    },
  ]);
  const [guidesPrompt, setGuidesPrompt] = useState('');
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
    messagesRef.current?.scrollTo(0, messagesRef.current.scrollHeight);
  }, [messages, loading, open]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const guides = await fetchPortalSupplierGuides(vendorNames);
      if (cancelled) return;
      setGuidesPrompt(formatSupplierGuidesForPrompt(guides, { portalOnly: true }));
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorNames.join('|')]);

  const systemPrompt = appendSupplierGuidesToPrompt(HANK_SYSTEM_PROMPT, guidesPrompt);

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

      const historyWithUser = [...conversation, { role: 'user', content: fullMessage }];
      try {
        const reply = await callHankAPI(historyWithUser, { systemPrompt });
        setConversation([...historyWithUser, { role: 'assistant', content: reply }]);
        setMessages((prev) => [...prev, { type: 'bot', text: reply, time: now() }]);
      } catch {
        const errText = "Something went wrong — try again in a moment.";
        setMessages((prev) => [...prev, { type: 'bot', text: errText, time: now() }]);
      } finally {
        setLoading(false);
      }
    },
    [attachments, clearAttachments, conversation, input, loading, readyAttachments, systemPrompt],
  );

  if (hidden) return null;

  return (
    <div className={`assistant-fab-wrap${open ? ' assistant-fab-wrap--open' : ''}`}>
      {open && (
        <div className="assistant-panel" role="dialog" aria-label="Ask Hank">
          <div className="assistant-panel-header">
            <div className="assistant-panel-title">
              <span className="assistant-panel-icon" aria-hidden>
                <AppIcon name="hank" size={16} />
              </span>
              <div>
                <div className="assistant-panel-name">Hank — AI Assistant</div>
                <div className="assistant-panel-sub">Your services, savings, and supplier guides</div>
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
                <div className="assistant-msg-bubble" dangerouslySetInnerHTML={{ __html: m.text }} />
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
              <button key={s} type="button" className="assistant-chip" onClick={() => void send(s)} disabled={loading}>
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
              placeholder="Ask about your services…"
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
        aria-label={open ? 'Close Ask Hank' : 'Open Ask Hank'}
        title="Ask Hank"
      >
        <span className="assistant-fab-icon" aria-hidden>
          <AppIcon name="hank" size={18} />
        </span>
        <span className="assistant-fab-label">{open ? 'Close' : 'Ask Hank'}</span>
      </button>
    </div>
  );
}
