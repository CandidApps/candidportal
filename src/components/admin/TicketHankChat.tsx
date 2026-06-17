'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { callHankAPI } from '@/lib/candid-data';
import type { UnifiedAdminTicket } from '@/lib/admin-tickets';
import type { CustomerPortalData } from '@/lib/portal-import/merge';
import type { TicketAgentBrief, TicketAgentInput } from '@/lib/ticket-action-agent';
import {
  buildTicketHankSystemPrompt,
  getTicketHankSuggestions,
} from '@/lib/ticket-hank-chat';

type ChatMsg = { type: 'user' | 'bot'; text: string; time: string };

function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

type TicketHankChatProps = {
  ticket: UnifiedAdminTicket;
  agentInput: TicketAgentInput;
  brief: TicketAgentBrief;
  portalCustomer?: CustomerPortalData;
};

export function TicketHankChat({
  ticket,
  agentInput,
  brief,
  portalCustomer,
}: TicketHankChatProps) {
  const systemPrompt = useMemo(
    () => buildTicketHankSystemPrompt(ticket, agentInput, brief, portalCustomer),
    [ticket, agentInput, brief, portalCustomer],
  );
  const suggestions = useMemo(() => getTicketHankSuggestions(ticket.kind), [ticket.kind]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState<{ role: string; content: string }[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      type: 'bot',
      time: 'Just now',
      text: "I've outlined recommended actions on the left. Ask me to draft emails, explain next steps, refine the approach, or make additional recommendations for this action.",
    },
  ]);
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInput('');
    setLoading(false);
    setConversation([]);
    setMessages([
      {
        type: 'bot',
        time: 'Just now',
        text: "I've outlined recommended actions on the left. Ask me to draft emails, explain next steps, refine the approach, or make additional recommendations for this action.",
      },
    ]);
  }, [ticket.id]);

  useEffect(() => {
    messagesRef.current?.scrollTo(0, messagesRef.current.scrollHeight);
  }, [messages, loading]);

  const send = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim();
      if (!msg || loading) return;
      setInput('');
      setLoading(true);
      setMessages((prev) => [...prev, { type: 'user', text: msg, time: now() }]);

      const historyWithUser = [...conversation, { role: 'user', content: msg }];
      try {
        const reply = await callHankAPI(historyWithUser, { systemPrompt });
        setConversation([...historyWithUser, { role: 'assistant', content: reply }]);
        setMessages((prev) => [...prev, { type: 'bot', text: reply, time: now() }]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { type: 'bot', text: 'Something went wrong — try again in a moment.', time: now() },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [conversation, input, loading, systemPrompt],
  );

  return (
    <div className="ticket-hank-chat">
      <div className="ticket-hank-chat-header">
        <span className="ticket-hank-chat-icon" aria-hidden>
          <AppIcon name="hank" size={14} />
        </span>
        <div>
          <div className="ticket-hank-chat-title">Ask Hank</div>
          <div className="ticket-hank-chat-sub">Questions, drafts, and recommendations for this action</div>
        </div>
      </div>

      <div className="ticket-hank-chat-messages" ref={messagesRef}>
        {messages.map((m, i) => (
          <div key={i} className={`ticket-hank-msg ticket-hank-msg--${m.type}`}>
            <div
              className="ticket-hank-msg-bubble"
              dangerouslySetInnerHTML={{ __html: m.text }}
            />
            <div className="ticket-hank-msg-time">{m.time}</div>
          </div>
        ))}
        {loading && (
          <div className="ticket-hank-msg ticket-hank-msg--bot">
            <div className="ticket-hank-msg-bubble">
              <div className="typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="ticket-hank-chat-suggestions">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            className="ticket-hank-chip"
            onClick={() => void send(s)}
            disabled={loading}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="ticket-hank-chat-input-row">
        <input
          className="ticket-hank-chat-input"
          placeholder="Ask Hank about this action…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void send()}
          disabled={loading}
        />
        <button
          type="button"
          className="ticket-hank-chat-send"
          onClick={() => void send()}
          disabled={loading || !input.trim()}
          aria-label="Send"
        >
          <AppIcon name="send" size={14} />
        </button>
      </div>
    </div>
  );
}
