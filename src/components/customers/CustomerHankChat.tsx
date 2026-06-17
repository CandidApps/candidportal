'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { callHankAPI } from '@/lib/candid-data';
import type { CandidContractRecord } from '@/lib/customer-records';
import type { CustomerAction } from '@/lib/portal-import/merge';
import type { Customer } from '@/components/CustomersView';
import {
  buildCustomerHankSystemPrompt,
  findActionForHankResolve,
  getCustomerHankSuggestions,
  parseHankActionBlocks,
  type HankActionAddPayload,
  type HankActionResolvePayload,
} from '@/lib/customer-hank-chat';
import type { ActionResolutionOutcome } from '@/lib/customer-actions-store';
import type { CustomActionDraft } from '@/components/customers/AddCustomActionModal';

type ChatMsg = {
  type: 'user' | 'bot';
  text: string;
  time: string;
  resolve?: HankActionResolvePayload;
  add?: HankActionAddPayload;
};

function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

type Props = {
  customer: Customer;
  openActions: CustomerAction[];
  contracts: CandidContractRecord[];
  onApplyResolve: (action: CustomerAction, payload: HankActionResolvePayload) => void;
  onApplyAdd: (draft: CustomActionDraft) => void;
  onOpenResolveModal: (action: CustomerAction, prefill?: { outcome?: ActionResolutionOutcome; notes?: string }) => void;
  onOpenAddModal: (prefill?: Partial<CustomActionDraft>) => void;
};

export function CustomerHankChat({
  customer,
  openActions,
  contracts,
  onApplyResolve,
  onApplyAdd,
  onOpenResolveModal,
  onOpenAddModal,
}: Props) {
  const [open, setOpen] = useState(false);
  const systemPrompt = useMemo(
    () => buildCustomerHankSystemPrompt(customer, openActions, contracts, customer.portal),
    [customer, openActions, contracts],
  );
  const suggestions = useMemo(() => getCustomerHankSuggestions(customer), [customer]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState<{ role: string; content: string }[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      type: 'bot',
      time: 'Just now',
      text: `I'm scoped to <strong>${customer.company}</strong>. Ask about renewals, contract updates, or say something like "Comcast was renewed" and I'll help you close the action.`,
    },
  ]);
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([
      {
        type: 'bot',
        time: 'Just now',
        text: `I'm scoped to <strong>${customer.company}</strong>. Ask about renewals, contract updates, or say something like "Comcast was renewed" and I'll help you close the action.`,
      },
    ]);
    setConversation([]);
    setInput('');
  }, [customer.id]);

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

      const historyWithUser = [...conversation, { role: 'user', content: msg }];
      try {
        const reply = await callHankAPI(historyWithUser, { systemPrompt });
        const parsed = parseHankActionBlocks(reply);
        setConversation([...historyWithUser, { role: 'assistant', content: reply }]);
        setMessages((prev) => [
          ...prev,
          {
            type: 'bot',
            text: parsed.displayText || reply,
            time: now(),
            resolve: parsed.resolve,
            add: parsed.add,
          },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { type: 'bot', text: 'Sorry — I could not reach Hank right now. Try again.', time: now() },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [conversation, input, loading, systemPrompt],
  );

  const applyResolve = (payload: HankActionResolvePayload) => {
    const action = findActionForHankResolve(openActions, payload);
    if (!action) {
      setMessages((prev) => [
        ...prev,
        {
          type: 'bot',
          text: 'I could not match that to an open action. Use <strong>Close</strong> on the action card or clarify which provider/action.',
          time: now(),
        },
      ]);
      return;
    }
    onOpenResolveModal(action, {
      outcome: payload.outcome,
      notes: payload.notes ?? '',
    });
  };

  const applyAdd = (payload: HankActionAddPayload) => {
    if (!payload.title?.trim()) return;
    onOpenAddModal({
      title: payload.title,
      detail: payload.detail ?? '',
      severity: payload.severity ?? 'soon',
      kind: payload.kind ?? 'custom',
      suggestedAction: payload.suggestedAction ?? 'Follow up with customer.',
      dueDate: payload.dueDate ?? '',
      provider: payload.provider ?? '',
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          right: 24,
          bottom: 24,
          zIndex: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 18px',
          borderRadius: 28,
          border: 'none',
          background: 'linear-gradient(135deg,#8B1A12,#E8453B)',
          color: '#fff',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 8px 28px rgba(200,40,30,0.35)',
        }}
      >
        <AppIcon name="hank" size={18} />
        Ask Hank
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        zIndex: 600,
        width: 380,
        maxWidth: 'calc(100vw - 32px)',
        height: 480,
        maxHeight: 'calc(100vh - 100px)',
        background: '#fff',
        borderRadius: 14,
        border: '1px solid #E2E2E2',
        boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          background: '#1E1E1E',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AppIcon name="hank" size={16} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Hank</div>
            <div style={{ fontSize: 10, color: '#9CA3AF' }}>{customer.company}</div>
          </div>
        </div>
        <button type="button" onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer' }}>✕</button>
      </div>

      <div ref={messagesRef} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.type === 'user' ? 'flex-end' : 'flex-start', maxWidth: '92%' }}>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                fontSize: 12,
                lineHeight: 1.5,
                background: m.type === 'user' ? '#1E1E1E' : '#F5F5F5',
                color: m.type === 'user' ? '#fff' : '#1E1E1E',
              }}
              dangerouslySetInnerHTML={{ __html: m.text }}
            />
            {m.resolve && (
              <button
                type="button"
                onClick={() => applyResolve(m.resolve!)}
                style={{
                  marginTop: 6,
                  padding: '6px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: '1px solid #C8281E',
                  background: '#FEF2F2',
                  color: '#C8281E',
                  cursor: 'pointer',
                }}
              >
                Open close action…
              </button>
            )}
            {m.add?.title && (
              <button
                type="button"
                onClick={() => applyAdd(m.add!)}
                style={{
                  marginTop: 6,
                  marginLeft: m.resolve ? 6 : 0,
                  padding: '6px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: '1px solid #1D4ED8',
                  background: '#EFF6FF',
                  color: '#1D4ED8',
                  cursor: 'pointer',
                }}
              >
                Add custom action…
              </button>
            )}
          </div>
        ))}
        {loading && <div style={{ fontSize: 12, color: '#6B6B6B' }}>Hank is thinking…</div>}
      </div>

      <div style={{ padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: 6, borderTop: '1px solid #E2E2E2' }}>
        {suggestions.slice(0, 2).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => void send(s)}
            style={{
              fontSize: 10,
              padding: '4px 10px',
              borderRadius: 20,
              border: '1px solid #E2E2E2',
              background: '#fff',
              cursor: 'pointer',
              color: '#6B6B6B',
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <div style={{ padding: 12, borderTop: '1px solid #E2E2E2', display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && void send()}
          placeholder={`Ask about ${customer.company}…`}
          style={{
            flex: 1,
            border: '1px solid #E2E2E2',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 12,
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={loading || !input.trim()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            border: 'none',
            background: 'linear-gradient(135deg,#8B1A12,#E8453B)',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          →
        </button>
      </div>
    </div>
  );
}
