'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { RichTextContent } from '@/components/RichTextContent';
import { ChatAttachmentChips, ChatAttachmentUploadButton } from '@/components/chat/ChatAttachmentControls';
import { useChatAttachments } from '@/components/chat/useChatAttachments';
import { buildMemberHankSystemPrompt, callHankAPI } from '@/lib/candid-data';
import {
  formatUserMessageDisplay,
  formatUserMessageWithAttachments,
} from '@/lib/chat-attachments';
import { formatHankChatHtml } from '@/lib/rich-text';
import { notifyActionCenterRefresh } from '@/lib/action-center-refresh';
import { MEMBER_RESPONSE_SLA_HOURS } from '@/lib/member-request-sla';
import {
  SERVICE_REQUEST_CATEGORIES,
  additionalServicesDraftIsValid,
  emptyAdditionalServicesDraft,
  formatAdditionalServicesMessage,
  serviceHelpGreeting,
  serviceRequestCategoryMeta,
  type AdditionalServicesRequestDraft,
  type ServiceRequestCategory,
} from '@/lib/service-request-config';
import type { ServiceCardModel } from '@/lib/services/account-services';
import type { MemberReviewRequestSource } from '@/lib/services/member-review-requests';
import { submitMemberServiceRequest } from '@/lib/services/member-service-requests';
import { fetchPortalSupplierGuides } from '@/lib/supplier-guides';
import type { SupplierGuide } from '@/lib/supplier-guides-types';
import { findPaymentSelfServiceGuide } from '@/lib/supplier-guide-match';

export type ServiceRequestContext = {
  service?: ServiceCardModel;
  requestSource?: MemberReviewRequestSource;
  category?: ServiceRequestCategory;
};

const CANDID_PHONE = '815-207-8000';
const CANDID_SCHEDULE_URL = 'https://candidsolutions.com/schedule';

type OptionKind = 'topic' | 'service' | 'guide' | 'escalate' | 'critical';

type ChatMsg = {
  id: string;
  role: 'bot' | 'user';
  text: string;
  options?: Array<{ id: string; label: string; href?: string }>;
  optionKind?: OptionKind;
};

type Props = {
  services: ServiceCardModel[];
  companyName: string;
  customerName: string;
  customerEmail: string;
  crmCustomerId?: string | null;
  context?: ServiceRequestContext;
  onClose: () => void;
  onSubmitted: () => void | Promise<void>;
};

function msgId() {
  return `m-${Math.random().toString(36).slice(2, 10)}`;
}

function generalServicePlaceholder(): ServiceCardModel {
  return {
    id: 'general',
    cls: '',
    logo: 'msp',
    logoTxt: 'EX',
    name: 'General account request',
    vendor: 'Candid',
    status: 'active',
    statusTxt: '',
    badge: null,
    candidManaged: false,
    pending: false,
    filter: [],
  };
}

function stripActionMarkers(text: string): {
  clean: string;
  escalate: boolean;
  critical: boolean;
} {
  const escalate = /\[\[ACTION:escalate\]\]/i.test(text);
  const critical = /\[\[ACTION:critical\]\]/i.test(text);
  const clean = text
    .replace(/\[\[ACTION:escalate\]\]/gi, '')
    .replace(/\[\[ACTION:critical\]\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { clean, escalate, critical };
}

export function ServiceRequestModal({
  services,
  companyName,
  customerName,
  customerEmail,
  crmCustomerId,
  context,
  onClose,
  onSubmitted,
}: Props) {
  const initialService = context?.service ?? null;
  const [category, setCategory] = useState<ServiceRequestCategory | null>(context?.category ?? null);
  const [service, setService] = useState<ServiceCardModel | null>(initialService);
  const [input, setInput] = useState('');
  const [additionalDraft, setAdditionalDraft] = useState<AdditionalServicesRequestDraft>(
    emptyAdditionalServicesDraft(),
  );
  const [paymentGuide, setPaymentGuide] = useState<SupplierGuide | null>(null);
  const [phase, setPhase] = useState<'chat' | 'guide' | 'done'>(
    context?.category && !initialService ? 'chat' : 'chat',
  );
  const [submitting, setSubmitting] = useState(false);
  const [hankLoading, setHankLoading] = useState(false);
  const [error, setError] = useState('');
  const [doneCopy, setDoneCopy] = useState('');
  const [conversation, setConversation] = useState<{ role: string; content: string }[]>([]);
  const [showAdditionalForm, setShowAdditionalForm] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const {
    attachments,
    readyAttachments,
    processing: attachmentProcessing,
    addFiles,
    removeAttachment,
    clearAttachments,
    canAddMore,
  } = useChatAttachments();

  const requestSource = context?.requestSource ?? 'my_services';
  const isAdditionalServices = category === 'additional_services';

  const activeServices = useMemo(
    () => services.filter((s) => s.status !== 'inactive'),
    [services],
  );

  const topicOptions = useMemo(
    () => SERVICE_REQUEST_CATEGORIES.map((c) => ({ id: c.id, label: c.chatLabel })),
    [],
  );

  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    const greeting = serviceHelpGreeting(initialService);
    if (context?.category) {
      const cat = serviceRequestCategoryMeta(context.category);
      const next: ChatMsg[] = [
        { id: msgId(), role: 'bot', text: greeting },
        { id: msgId(), role: 'user', text: cat.chatLabel },
      ];
      if (!initialService) {
        next.push({
          id: msgId(),
          role: 'bot',
          text: 'Which service is this about?',
          options: [
            ...activeServices.map((s) => ({
              id: s.id,
              label: s.productName || s.name,
            })),
            { id: '__general__', label: 'General / not one service' },
          ],
          optionKind: 'service',
        });
      } else {
        next.push({ id: msgId(), role: 'bot', text: cat.detailPrompt });
      }
      return next;
    }
    return [
      {
        id: msgId(),
        role: 'bot',
        text: greeting,
        options: topicOptions,
        optionKind: 'topic',
      },
    ];
  });

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, hankLoading, paymentGuide, attachments.length]);

  useEffect(() => {
    if (phase !== 'guide' || !service?.vendor) return;
    let cancelled = false;
    void (async () => {
      const data = await fetchPortalSupplierGuides([service.vendor]);
      if (cancelled) return;
      const guide = findPaymentSelfServiceGuide(data);
      setPaymentGuide(guide);
      if (!guide) {
        setPhase('chat');
        setMessages((prev) => [
          ...prev,
          {
            id: msgId(),
            role: 'bot',
            text: "I don't have self-service payment steps for this supplier yet. Tell me what you need updated.",
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: msgId(),
            role: 'bot',
            text: `You may be able to update billing for ${service.vendor || service.name} yourself. Take a look below — or say if you still want Candid to handle it.`,
            options: [
              { id: 'guide_solved', label: 'This solved it' },
              { id: 'guide_need_help', label: 'I still need Candid' },
            ],
            optionKind: 'guide',
          },
        ]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, service?.id, service?.vendor, service?.name]);

  const pushBot = (text: string, extras?: Partial<ChatMsg>) => {
    setMessages((prev) => [...prev, { id: msgId(), role: 'bot', text, ...extras }]);
  };

  const pushUser = (text: string) => {
    setMessages((prev) => [...prev, { id: msgId(), role: 'user', text }]);
  };

  const criticalOptions = (): ChatMsg['options'] => [
    { id: 'call', label: `Call ${CANDID_PHONE}`, href: `tel:${CANDID_PHONE.replace(/\D/g, '')}` },
    { id: 'schedule', label: 'Schedule a meeting', href: CANDID_SCHEDULE_URL },
    { id: 'escalate_yes', label: 'Yes — open a ticket' },
    { id: 'escalate_no', label: 'No thanks' },
  ];

  const escalateOptions = (): ChatMsg['options'] => [
    { id: 'escalate_yes', label: 'Yes — open a ticket' },
    { id: 'escalate_no', label: 'No thanks' },
  ];

  const presentHankReply = (raw: string) => {
    const { clean, escalate, critical } = stripActionMarkers(raw);
    if (critical) {
      pushBot(
        `${clean}\n\nThis looks time-sensitive. You can call Candid now or schedule a meeting — or I can open a ticket for the team.`,
        { options: criticalOptions(), optionKind: 'critical' },
      );
      return;
    }
    if (escalate) {
      pushBot(
        clean.includes('send this to the team') || clean.includes('open a ticket')
          ? clean
          : `${clean}\n\nWould you like me to send this to the Candid team and open a ticket?`,
        { options: escalateOptions(), optionKind: 'escalate' },
      );
      return;
    }
    pushBot(clean);
  };

  const startDetailsFor = (svc: ServiceCardModel, catId: ServiceRequestCategory) => {
    setService(svc);
    const cat = serviceRequestCategoryMeta(catId);
    if (cat.selfServiceFirst) {
      setPhase('guide');
      return;
    }
    setPhase('chat');
    if (catId === 'additional_services') {
      setAdditionalDraft(emptyAdditionalServicesDraft());
      setShowAdditionalForm(true);
      pushBot(`${cat.detailPrompt} You can fill in the quick details below, or describe it here.`);
    } else {
      setShowAdditionalForm(false);
      pushBot(cat.detailPrompt);
    }
  };

  const pickCategory = (id: ServiceRequestCategory) => {
    const cat = serviceRequestCategoryMeta(id);
    setCategory(id);
    setError('');
    pushUser(cat.chatLabel);

    if (initialService || service) {
      startDetailsFor(initialService ?? service!, id);
      return;
    }

    pushBot('Which service is this about?', {
      options: [
        ...activeServices.map((s) => ({
          id: s.id,
          label: s.productName || s.name,
        })),
        ...(id === 'additional_services'
          ? []
          : [{ id: '__general__', label: 'General / not one service' }]),
      ],
      optionKind: 'service',
    });
  };

  const pickServiceOption = (optionId: string) => {
    if (!category) return;
    if (optionId === '__general__') {
      pushUser('General / not one service');
      startDetailsFor(generalServicePlaceholder(), category);
      return;
    }
    const svc = activeServices.find((s) => s.id === optionId);
    if (!svc) return;
    pushUser(svc.productName || svc.name);
    startDetailsFor(svc, category);
  };

  const composedEscalationMessage = (): string => {
    if (isAdditionalServices && service) {
      const validationError = additionalServicesDraftIsValid(additionalDraft);
      if (!validationError) {
        return formatAdditionalServicesMessage(additionalDraft, service.name);
      }
    }
    const transcript = messages
      .filter((m) => m.role === 'user' || m.role === 'bot')
      .slice(-12)
      .map((m) => `${m.role === 'user' ? 'Member' : 'Hank'}: ${m.text}`)
      .join('\n');
    return transcript || 'Member requested help via Get help chat.';
  };

  const finish = async (outcome: 'self_service' | 'escalated') => {
    const cat = category ?? 'support_ticket';
    const svc = service ?? initialService ?? generalServicePlaceholder();
    if (outcome === 'escalated' && isAdditionalServices) {
      const validationError = additionalServicesDraftIsValid(additionalDraft);
      if (validationError && showAdditionalForm) {
        setError(validationError);
        return;
      }
    }
    setSubmitting(true);
    setError('');
    const result = await submitMemberServiceRequest({
      category: cat,
      outcome,
      message: composedEscalationMessage(),
      serviceName: svc.name,
      vendorName: svc.vendor,
      customerName,
      customerEmail,
      accountServiceId: svc && !svc.id.startsWith('portal-') && svc.id !== 'general' ? svc.id : undefined,
      analysisReviewId: svc.analysisReviewId ?? undefined,
      crmCustomerId: crmCustomerId ?? undefined,
      requestSource,
      guideId: paymentGuide?.id,
      guideTitle: paymentGuide?.title,
      addedSeatCount: isAdditionalServices
        ? Math.max(0, Math.floor(Number(additionalDraft.quantity) || 0))
        : undefined,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? 'Request failed');
      return;
    }
    notifyActionCenterRefresh();
    await onSubmitted();
    const copy =
      outcome === 'self_service'
        ? 'Glad that helped! I saved this to your portal history.'
        : `Got it — I opened a ticket for the Candid team. They'll follow up within ${MEMBER_RESPONSE_SLA_HOURS} hours.`;
    setDoneCopy(copy);
    setPhase('done');
    pushBot(copy);
  };

  const pickGuideOption = async (optionId: string) => {
    if (optionId === 'guide_solved') {
      pushUser('This solved it');
      await finish('self_service');
      return;
    }
    pushUser('I still need Candid');
    setPhase('chat');
    presentHankReply(
      "No problem — tell me what still needs updating and I'll help.\n\n[[ACTION:escalate]]",
    );
  };

  const handleActionOption = async (optionId: string, kind: OptionKind) => {
    if (kind === 'critical' && (optionId === 'call' || optionId === 'schedule')) {
      // Anchor-based options open via href in the chip renderer.
      return;
    }
    if (optionId === 'escalate_yes') {
      pushUser('Yes — open a ticket');
      setCategory((prev) => prev ?? 'support_ticket');
      if (!service && initialService) setService(initialService);
      if (!service && !initialService) setService(generalServicePlaceholder());
      await finish('escalated');
      return;
    }
    if (optionId === 'escalate_no') {
      pushUser('No thanks');
      pushBot('Sounds good. Ask me anything else whenever you need.');
    }
  };

  const hankSystemPrompt = useMemo(() => {
    const catLine = category
      ? `They selected Get help topic: ${serviceRequestCategoryMeta(category).label}.`
      : 'They may chat freely or pick a topic chip.';
    return buildMemberHankSystemPrompt({
      companyName: companyName || 'Your company',
      contactName: customerName,
      contactEmail: customerEmail,
      customerId: crmCustomerId,
      services: activeServices.map((s) => ({
        name: s.name,
        productName: s.productName,
        vendor: s.vendor,
        candidManaged: s.candidManaged,
        statusTxt: s.statusTxt,
        amount: s.amount,
      })),
      focusService: (service || initialService)
        ? {
            name: (service || initialService)!.name,
            productName: (service || initialService)!.productName,
            vendor: (service || initialService)!.vendor,
            candidManaged: (service || initialService)!.candidManaged,
            statusTxt: (service || initialService)!.statusTxt,
            amount: (service || initialService)!.amount,
          }
        : null,
      extraContext: `This is the Get help chat. Be concise and conversational. ${catLine}

ESCALATION RULES:
- Prefer answering in chat when you can.
- If you are unsure, cannot verify account-specific facts, or the member needs a human action, end your reply with a short offer to open a ticket AND put [[ACTION:escalate]] on its own line.
- If the issue sounds critical/urgent (outage, cannot make calls, payments failing, security lockout, service completely down), put [[ACTION:critical]] on its own line. Critical contact: phone ${CANDID_PHONE}, schedule ${CANDID_SCHEDULE_URL}.
- Never invent a ticket confirmation. Only the member confirming "Yes — open a ticket" creates one.
- Do not tell them to use a separate Send/Send to team button.`,
    });
  }, [
    activeServices,
    category,
    companyName,
    crmCustomerId,
    customerEmail,
    customerName,
    initialService,
    service,
  ]);

  const sendFreeform = async () => {
    const text = input.trim();
    if ((!text && !readyAttachments.length) || hankLoading || submitting || phase === 'done') {
      return;
    }
    setInput('');
    setError('');

    const fullMessage = formatUserMessageWithAttachments(text, attachments);
    const displayText = formatUserMessageDisplay(
      text,
      readyAttachments.map((a) => a.name),
    );
    pushUser(displayText || 'Uploaded a file');
    clearAttachments();

    // Topic not chosen yet — free chat, keep topics available after reply.
    if (!category) {
      setHankLoading(true);
      const history = [...conversation, { role: 'user', content: fullMessage }];
      try {
        const reply = await callHankAPI(history, { systemPrompt: hankSystemPrompt });
        setConversation([...history, { role: 'assistant', content: reply }]);
        const { clean, escalate, critical } = stripActionMarkers(reply);
        if (critical || escalate) {
          presentHankReply(reply);
        } else {
          pushBot(`${clean}\n\nIf one of these topics fits, tap it — or keep typing.`, {
            options: topicOptions,
            optionKind: 'topic',
          });
        }
      } catch {
        pushBot('Something went wrong on my end. Pick a topic below, or try again.', {
          options: topicOptions,
          optionKind: 'topic',
        });
      } finally {
        setHankLoading(false);
      }
      return;
    }

    setHankLoading(true);
    const history = [...conversation, { role: 'user', content: fullMessage }];
    try {
      const reply = await callHankAPI(history, { systemPrompt: hankSystemPrompt });
      setConversation([...history, { role: 'assistant', content: reply }]);
      presentHankReply(reply);
    } catch {
      presentHankReply(
        "I'm having trouble answering that right now.\n\nWould you like me to send this to the Candid team and open a ticket?\n\n[[ACTION:escalate]]",
      );
    } finally {
      setHankLoading(false);
    }
  };

  const setAdditionalField = <K extends keyof AdditionalServicesRequestDraft>(
    key: K,
    value: AdditionalServicesRequestDraft[K],
  ) => {
    setAdditionalDraft((prev) => ({ ...prev, [key]: value }));
    if (error) setError('');
  };

  const showGuideCard = phase === 'guide' && Boolean(paymentGuide);

  return (
    <div className="modal-overlay open">
      <div
        className="modal-box service-request-modal service-request-modal--chat"
        role="dialog"
        aria-label="Get help"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-header-left">
            <div className="modal-hank-avatar">
              <AppIcon name="hank" size={18} />
            </div>
            <div>
              <div className="modal-title">Get help</div>
              <div className="modal-subtitle">
                {service || initialService
                  ? `${(service || initialService)!.productName || (service || initialService)!.name}${
                      (service || initialService)!.vendor
                        ? ` · ${(service || initialService)!.vendor}`
                        : ''
                    }`
                  : companyName || 'Chat with Hank'}
              </div>
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="service-request-chat">
          <div className="service-request-chat-list" ref={listRef}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`service-request-chat-msg service-request-chat-msg--${m.role}`}
              >
                {m.role === 'bot' ? (
                  <div
                    className="service-request-chat-bubble"
                    dangerouslySetInnerHTML={{ __html: formatHankChatHtml(m.text) }}
                  />
                ) : (
                  <div className="service-request-chat-bubble">{m.text}</div>
                )}
                {m.options && m.options.length > 0 ? (
                  <div className="service-request-chat-options">
                    {m.options.map((opt) =>
                      opt.href ? (
                        <a
                          key={opt.id}
                          className="service-request-chat-chip service-request-chat-chip--link"
                          href={opt.href}
                          target={opt.href.startsWith('http') ? '_blank' : undefined}
                          rel={opt.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                        >
                          {opt.label}
                        </a>
                      ) : (
                        <button
                          key={opt.id}
                          type="button"
                          className="service-request-chat-chip"
                          disabled={submitting || hankLoading}
                          onClick={() => {
                            if (m.optionKind === 'topic') {
                              pickCategory(opt.id as ServiceRequestCategory);
                            } else if (m.optionKind === 'service') {
                              pickServiceOption(opt.id);
                            } else if (m.optionKind === 'guide') {
                              void pickGuideOption(opt.id);
                            } else if (m.optionKind === 'escalate' || m.optionKind === 'critical') {
                              void handleActionOption(opt.id, m.optionKind);
                            }
                          }}
                        >
                          {opt.label}
                        </button>
                      ),
                    )}
                  </div>
                ) : null}
              </div>
            ))}

            {showGuideCard && paymentGuide ? (
              <div className="service-request-guide-card">
                <div className="service-request-guide-title">{paymentGuide.title}</div>
                <RichTextContent content={paymentGuide.content} />
              </div>
            ) : null}

            {showAdditionalForm && isAdditionalServices ? (
              <div className="service-request-additional service-request-additional--chat">
                <label className="service-request-field">
                  <span>How many *</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={additionalDraft.quantity}
                    onChange={(e) => setAdditionalField('quantity', e.target.value)}
                    placeholder="e.g. 2"
                  />
                </label>
                <label className="service-request-field">
                  <span>What are you adding? *</span>
                  <input
                    type="text"
                    value={additionalDraft.itemType}
                    onChange={(e) => setAdditionalField('itemType', e.target.value)}
                    placeholder="e.g. seats, extensions"
                  />
                </label>
                <label className="service-request-field">
                  <span>Who / emails *</span>
                  <input
                    type="text"
                    value={additionalDraft.people}
                    onChange={(e) => setAdditionalField('people', e.target.value)}
                    placeholder="Names"
                  />
                </label>
                <label className="service-request-field">
                  <span>Emails *</span>
                  <input
                    type="text"
                    value={additionalDraft.emails}
                    onChange={(e) => setAdditionalField('emails', e.target.value)}
                    placeholder="name@company.com"
                  />
                </label>
                <label className="service-request-field">
                  <span>Needed by *</span>
                  <input
                    type="date"
                    value={additionalDraft.neededBy}
                    onChange={(e) => setAdditionalField('neededBy', e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="service-request-chat-chip"
                  disabled={submitting}
                  onClick={() => {
                    pushUser('Please open a ticket with these seat/license details');
                    void finish('escalated');
                  }}
                >
                  Open ticket with these details
                </button>
              </div>
            ) : null}

            {hankLoading ? (
              <div className="service-request-chat-msg service-request-chat-msg--bot">
                <div className="service-request-chat-bubble service-request-chat-bubble--typing">
                  Hank is typing…
                </div>
              </div>
            ) : null}
          </div>

          {error ? <p className="service-request-error">{error}</p> : null}

          {phase === 'done' ? (
            <div className="service-request-chat-footer">
              <p className="service-request-sla">{doneCopy}</p>
              <button type="button" className="btn-primary" onClick={onClose}>
                Close
              </button>
            </div>
          ) : (
            <div className="service-request-chat-footer">
              <ChatAttachmentChips
                attachments={attachments}
                onRemoveAttachment={removeAttachment}
                variant="chat"
              />
              <div className="service-request-chat-input-row">
                <ChatAttachmentUploadButton
                  processing={attachmentProcessing}
                  canAddMore={canAddMore}
                  onAddFiles={addFiles}
                  variant="chat"
                />
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void sendFreeform();
                    }
                  }}
                  placeholder="Ask Hank anything…"
                  disabled={submitting || hankLoading}
                />
                <button
                  type="button"
                  className="service-request-chat-send"
                  disabled={
                    submitting ||
                    hankLoading ||
                    attachmentProcessing ||
                    (!input.trim() && !readyAttachments.length)
                  }
                  onClick={() => void sendFreeform()}
                  aria-label="Send"
                >
                  <AppIcon name="send" size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
