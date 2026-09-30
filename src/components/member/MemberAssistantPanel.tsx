'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import {
  buildMemberHankSystemPrompt,
  callHankAPI,
  type MemberHankServiceSnapshot,
} from '@/lib/candid-data';
import {
  formatUserMessageDisplay,
  formatUserMessageWithAttachments,
} from '@/lib/chat-attachments';
import { ChatAttachmentChips, ChatAttachmentUploadButton } from '@/components/chat/ChatAttachmentControls';
import { useChatAttachments } from '@/components/chat/useChatAttachments';
import { formatHankChatHtml } from '@/lib/rich-text';
import {
  appendSupplierGuidesToPrompt,
  formatSupplierGuidesForPrompt,
} from '@/lib/supplier-guides-context';
import { fetchPortalSupplierGuides } from '@/lib/supplier-guides';
import {
  appendSupplierSourcesToPrompt,
  formatSupplierSourcesForPrompt,
} from '@/lib/supplier-sources-context';
import { fetchPortalSupplierSources } from '@/lib/supplier-sources';
import { describeProductMatches, fetchProductMatches } from '@/lib/member-product-search-client';

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
  companyName,
  contactName,
  contactEmail,
  customerId,
  services = [],
  hidden,
}: {
  vendorNames: string[];
  companyName: string;
  contactName?: string;
  contactEmail?: string;
  customerId?: string | null;
  services?: MemberHankServiceSnapshot[];
  hidden?: boolean;
}) {
  const [open, setOpen] = useState(false);
  /** Opened on request (e.g. from search) — shows even on screens where the button is normally hidden. */
  const [summoned, setSummoned] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState<{ role: string; content: string }[]>([]);
  const [messages, setMessages] = useState<AssistantMsg[]>([
    {
      type: 'bot',
      time: 'Just now',
      text: 'Hi — I\'m Frank. Ask about your services, contracts, savings opportunities, or supplier resources from your vendors.',
    },
  ]);
  const [guidesPrompt, setGuidesPrompt] = useState('');
  const [sourcesPrompt, setSourcesPrompt] = useState('');
  /** Latest sellable-product matches for what the member asked about; kept for follow-up questions. */
  const productPromptRef = useRef('');
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
    void (async () => {
      const refs = await fetchPortalSupplierSources(vendorNames);
      if (cancelled) return;
      setSourcesPrompt(formatSupplierSourcesForPrompt(refs, { portalOnly: true }));
    })();
    return () => {
      cancelled = true;
    };
  }, [vendorNames.join('|')]);

  const systemPrompt = useMemo(() => {
    const memberPrompt = buildMemberHankSystemPrompt({
      companyName: companyName || 'Your company',
      contactName,
      contactEmail,
      customerId,
      services,
    });
    return appendSupplierSourcesToPrompt(
      appendSupplierGuidesToPrompt(memberPrompt, guidesPrompt),
      sourcesPrompt,
    );
  }, [companyName, contactEmail, contactName, customerId, guidesPrompt, services, sourcesPrompt]);

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
        if (msg) {
          const matches = await fetchProductMatches(msg);
          if (matches.length) productPromptRef.current = describeProductMatches(msg, matches);
        }
        const prompt = productPromptRef.current ? `${systemPrompt}\n\n${productPromptRef.current}` : systemPrompt;
        const reply = await callHankAPI(historyWithUser, { systemPrompt: prompt });
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

  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (
        event as CustomEvent<{ prompt?: string; greeting?: string; context?: string; searchQuery?: string }>
      ).detail;
      setOpen(true);
      setSummoned(true);
      const searchQuery = detail?.searchQuery?.trim();
      if (searchQuery) {
        void fetchProductMatches(searchQuery).then((matches) => {
          productPromptRef.current = matches.length ? describeProductMatches(searchQuery, matches) : '';
        });
      }
      const greeting = detail?.greeting?.trim();
      if (greeting) {
        setMessages((prev) => [...prev, { type: 'bot', text: greeting, time: now() }]);
        // Keep user/assistant turns alternating: the hidden user turn carries what they searched for.
        setConversation((prev) => [
          ...prev,
          { role: 'user', content: detail?.context?.trim() || 'I need help.' },
          { role: 'assistant', content: greeting },
        ]);
      }
      const prompt = detail?.prompt?.trim();
      if (prompt) {
        window.setTimeout(() => {
          void sendRef.current(prompt);
        }, 0);
      }
    };
    window.addEventListener('candid:open-hank', onOpen);
    return () => window.removeEventListener('candid:open-hank', onOpen);
  }, []);

  if (hidden && !summoned) return null;

  const close = () => {
    setOpen(false);
    setSummoned(false);
  };

  return (
    <div className={`assistant-fab-wrap${open ? ' assistant-fab-wrap--open' : ''}`}>
      {open && (
        <div className="assistant-panel" role="dialog" aria-label="Ask Frank">
          <div className="assistant-panel-header">
            <div className="assistant-panel-title">
              <span className="assistant-panel-icon" aria-hidden>
                <AppIcon name="hank" size={16} />
              </span>
              <div>
                <div className="assistant-panel-name">Frank — AI Assistant</div>
                <div className="assistant-panel-sub">
                  {companyName ? `${companyName} · services & savings` : 'Your services, savings, and supplier guides'}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="assistant-panel-close"
              onClick={close}
              aria-label="Close assistant"
            >
              <AppIcon name="close" size={14} />
            </button>
          </div>

          <div className="assistant-panel-messages" ref={messagesRef}>
            {messages.map((m, i) => (
              <div key={i} className={`assistant-msg assistant-msg--${m.type}`}>
                {m.type === 'bot' ? (
                  <div
                    className="assistant-msg-bubble"
                    dangerouslySetInnerHTML={{ __html: formatHankChatHtml(m.text) }}
                  />
                ) : (
                  <div className="assistant-msg-bubble">{m.text}</div>
                )}
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
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={open ? 'Close Ask Frank' : 'Open Ask Frank'}
        title="Ask Frank"
      >
        <span className="assistant-fab-icon" aria-hidden>
          <AppIcon name="hank" size={18} />
        </span>
        <span className="assistant-fab-label">{open ? 'Close' : 'Ask Frank'}</span>
      </button>
    </div>
  );
}
