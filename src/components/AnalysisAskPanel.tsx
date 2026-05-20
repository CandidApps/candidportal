'use client';

import { useCallback, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import type { MerchantAnalysisSnapshot } from '@/lib/candid-pay/merchant-analysis';
import { AppIcon } from '@/components/AppIcon';

type ChatMsg = { type: 'user' | 'bot'; text: string };

type AnalysisAskPanelProps = {
  snapshot: MerchantAnalysisSnapshot;
  userId?: string;
  serviceId?: string;
  customerName: string;
  customerEmail: string;
};

export default function AnalysisAskPanel({
  snapshot,
  userId,
  serviceId,
  customerName,
  customerEmail,
}: AnalysisAskPanelProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestTicket, setSuggestTicket] = useState(false);
  const [lastQuestion, setLastQuestion] = useState('');
  const [lastReply, setLastReply] = useState('');
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [ticketSent, setTicketSent] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
    });
  };

  const sendMessage = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim();
      if (!msg || loading) return;
      setInput('');
      setError('');
      setSuggestTicket(false);
      setTicketSent(false);
      setLastQuestion(msg);

      const nextMessages: ChatMsg[] = [...messages, { type: 'user', text: msg }];
      setMessages(nextMessages);
      setLoading(true);
      scrollToEnd();

      const apiMessages = nextMessages.map((m) => ({
        role: m.type === 'user' ? 'user' : 'assistant',
        content: m.text.replace(/<[^>]+>/g, ''),
      }));

      try {
        const res = await fetch('/api/analysis-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages, analysisContext: snapshot }),
        });

        const data = (await res.json()) as {
          text?: string;
          suggestTicket?: boolean;
          error?: string;
        };

        if (!res.ok) throw new Error(data.error ?? 'Request failed');

        const reply = data.text ?? '';
        setLastReply(reply);
        setSuggestTicket(Boolean(data.suggestTicket));
        setMessages((prev) => [...prev, { type: 'bot', text: reply }]);
      } catch (err) {
        console.error('analysis-chat', err);
        setError('Could not reach Hank right now. Try again or open a ticket for your specialist.');
        setSuggestTicket(true);
        setLastReply('');
      } finally {
        setLoading(false);
        scrollToEnd();
      }
    },
    [input, loading, messages, snapshot]
  );

  const openTicket = useCallback(async () => {
    if (!userId || ticketSubmitting || ticketSent) return;
    const question = lastQuestion.trim();
    if (!question) return;

    setTicketSubmitting(true);
    setError('');

    const supabase = createSupabaseBrowserClient();
    const { error: insertError } = await supabase.from('analysis_tickets').insert({
      user_id: userId,
      account_service_id: serviceId ?? null,
      customer_email: customerEmail,
      customer_name: customerName,
      merchant_name: snapshot.form.merchantName || null,
      question,
      last_ai_reply: lastReply || null,
      status: 'open',
      analysis_context: snapshot,
    });

    setTicketSubmitting(false);

    if (insertError) {
      console.error('analysis_tickets insert', insertError);
      setError('Could not open your ticket. Please try again.');
      return;
    }

    setTicketSent(true);
    setSuggestTicket(false);
  }, [
    userId,
    ticketSubmitting,
    ticketSent,
    lastQuestion,
    lastReply,
    serviceId,
    customerEmail,
    customerName,
    snapshot,
  ]);

  return (
    <div className="analysis-ask-panel">
      <button
        type="button"
        className="analysis-ask-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="analysis-ask-trigger-icon">
          <AppIcon name="hank" size={18} />
        </span>
        <span className="analysis-ask-trigger-text">
          {open ? 'Hide questions about this analysis' : 'Ask a question about this analysis'}
        </span>
        <span className="analysis-ask-chevron" aria-hidden>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="analysis-ask-body">
          <div className="analysis-ask-messages" ref={scrollRef}>
            {messages.length === 0 && (
              <p className="analysis-ask-hint">
                Ask Hank anything about your statement analysis — fees, savings options, or what a
                line item means. If it needs a human specialist, you can open a ticket for the
                Candid team.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`analysis-ask-msg analysis-ask-msg-${m.type}`}>
                <div className="analysis-ask-msg-avatar">
                  {m.type === 'bot' ? <AppIcon name="hank" size={12} /> : customerName.slice(0, 2).toUpperCase()}
                </div>
                <div
                  className="analysis-ask-msg-text"
                  dangerouslySetInnerHTML={{ __html: m.text }}
                />
              </div>
            ))}
            {loading && (
              <div className="analysis-ask-msg analysis-ask-msg-bot">
                <div className="analysis-ask-msg-avatar">
                  <AppIcon name="hank" size={12} />
                </div>
                <div className="analysis-ask-msg-text analysis-ask-typing">Thinking…</div>
              </div>
            )}
          </div>

          {error && <div className="analysis-ask-error">{error}</div>}

          {(suggestTicket || ticketSent) && (
            <div className="analysis-ask-ticket-box">
              {ticketSent ? (
                <p>
                  <strong>Ticket submitted.</strong> Your Candid specialist will follow up on this
                  question.
                </p>
              ) : (
                <>
                  <p>
                    This may need a specialist. Open a ticket and the Candid team will respond.
                  </p>
                  <button
                    type="button"
                    className="analysis-ask-ticket-btn"
                    disabled={!userId || ticketSubmitting}
                    onClick={() => void openTicket()}
                  >
                    {ticketSubmitting ? 'Submitting…' : 'Open a ticket for Candid team'}
                  </button>
                  {!userId && (
                    <p className="analysis-ask-ticket-note">Sign in to submit a ticket.</p>
                  )}
                </>
              )}
            </div>
          )}

          <div className="analysis-ask-input-row">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="e.g. What does the non-qualified fee mean on my statement?"
              disabled={loading}
            />
            <button
              type="button"
              className="analysis-ask-send"
              disabled={loading || !input.trim()}
              onClick={() => void sendMessage()}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
