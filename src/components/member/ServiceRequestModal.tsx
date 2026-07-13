'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { RichTextContent } from '@/components/RichTextContent';
import { notifyActionCenterRefresh } from '@/lib/action-center-refresh';
import { MEMBER_RESPONSE_SLA_HOURS } from '@/lib/member-request-sla';
import {
  SERVICE_REQUEST_CATEGORIES,
  additionalServicesDraftIsValid,
  emptyAdditionalServicesDraft,
  formatAdditionalServicesMessage,
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

type Step = 'category' | 'service' | 'details' | 'guide' | 'done';

export type ServiceRequestContext = {
  service?: ServiceCardModel;
  requestSource?: MemberReviewRequestSource;
  category?: ServiceRequestCategory;
};

type Props = {
  services: ServiceCardModel[];
  customerName: string;
  customerEmail: string;
  crmCustomerId?: string | null;
  context?: ServiceRequestContext;
  onClose: () => void;
  onSubmitted: () => void | Promise<void>;
};

export function ServiceRequestModal({
  services,
  customerName,
  customerEmail,
  crmCustomerId,
  context,
  onClose,
  onSubmitted,
}: Props) {
  const initialService = context?.service ?? null;
  const [step, setStep] = useState<Step>(context?.category ? (initialService ? 'details' : 'service') : 'category');
  const [category, setCategory] = useState<ServiceRequestCategory | null>(context?.category ?? null);
  const [service, setService] = useState<ServiceCardModel | null>(initialService);
  const [message, setMessage] = useState('');
  const [additionalDraft, setAdditionalDraft] = useState<AdditionalServicesRequestDraft>(emptyAdditionalServicesDraft);
  const [paymentGuide, setPaymentGuide] = useState<SupplierGuide | null>(null);
  const [loadingGuides, setLoadingGuides] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [doneCopy, setDoneCopy] = useState('');

  const meta = category ? serviceRequestCategoryMeta(category) : null;
  const requestSource = context?.requestSource ?? 'my_services';
  const isAdditionalServices = category === 'additional_services';

  const activeServices = useMemo(
    () => services.filter((s) => s.status !== 'inactive'),
    [services],
  );

  useEffect(() => {
    if (step !== 'guide' || !service?.vendor) return;
    let cancelled = false;
    void (async () => {
      setLoadingGuides(true);
      const data = await fetchPortalSupplierGuides([service.vendor]);
      if (cancelled) return;
      const guide = findPaymentSelfServiceGuide(data);
      setPaymentGuide(guide);
      setLoadingGuides(false);
      if (!guide) {
        setStep('details');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, service?.vendor]);

  const pickCategory = (id: ServiceRequestCategory) => {
    setCategory(id);
    setError('');
    if (id === 'additional_services') {
      setAdditionalDraft(emptyAdditionalServicesDraft());
    }
    const cat = serviceRequestCategoryMeta(id);
    if (initialService) {
      setService(initialService);
      if (cat.selfServiceFirst) {
        setStep('guide');
      } else {
        setStep('details');
      }
      return;
    }
    setStep('service');
  };

  const pickService = (svc: ServiceCardModel) => {
    setService(svc);
    setError('');
    if (meta?.selfServiceFirst) {
      setStep('guide');
    } else {
      setStep('details');
    }
  };

  const composedMessage = (): string => {
    if (isAdditionalServices && service) {
      return formatAdditionalServicesMessage(additionalDraft, service.name);
    }
    return message.trim();
  };

  const buildPayload = (outcome: 'self_service' | 'escalated') => ({
    category: category!,
    outcome,
    message: composedMessage() || undefined,
    serviceName: service?.name ?? 'General request',
    vendorName: service?.vendor,
    customerName,
    customerEmail,
    accountServiceId: service && !service.id.startsWith('portal-') ? service.id : undefined,
    analysisReviewId: service?.analysisReviewId ?? undefined,
    crmCustomerId: crmCustomerId ?? undefined,
    requestSource,
    guideId: paymentGuide?.id,
    guideTitle: paymentGuide?.title,
    addedSeatCount: isAdditionalServices
      ? Math.max(0, Math.floor(Number(additionalDraft.quantity) || 0))
      : undefined,
  });

  const finish = async (outcome: 'self_service' | 'escalated') => {
    if (!category) return;
    if (outcome === 'escalated') {
      if (isAdditionalServices) {
        const validationError = additionalServicesDraftIsValid(additionalDraft);
        if (validationError) {
          setError(validationError);
          return;
        }
      } else if (!message.trim()) {
        setError('Please describe what you need so our team can help.');
        return;
      }
    }
    setSubmitting(true);
    setError('');
    const result = await submitMemberServiceRequest(buildPayload(outcome));
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? 'Request failed');
      return;
    }
    notifyActionCenterRefresh();
    await onSubmitted();
    setDoneCopy(
      outcome === 'self_service'
        ? 'Glad that helped! We saved this to your portal history.'
        : `Request submitted. The Candid team will follow up within ${MEMBER_RESPONSE_SLA_HOURS} hours.`,
    );
    setStep('done');
  };

  const setAdditionalField = <K extends keyof AdditionalServicesRequestDraft>(
    key: K,
    value: AdditionalServicesRequestDraft[K],
  ) => {
    setAdditionalDraft((prev) => ({ ...prev, [key]: value }));
    if (error) setError('');
  };

  return (
    <div className="modal-overlay open">
      <div
        className="modal-box service-request-modal"
        role="dialog"
        aria-label="Get help"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-header-left">
            <div className="modal-hank-avatar">
              <AppIcon name="messages" size={18} />
            </div>
            <div>
              <div className="modal-title">Get help</div>
              <div className="modal-subtitle">
                {step === 'category' && 'What can we help you with?'}
                {step === 'service' && 'Which service is this about?'}
                {step === 'details' && meta?.label}
                {step === 'guide' && 'Try these steps first'}
                {step === 'done' && 'All set'}
              </div>
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-body service-request-body">
          {step === 'category' && (
            <div className="service-request-categories">
              {SERVICE_REQUEST_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="service-request-category"
                  onClick={() => pickCategory(c.id)}
                >
                  <span className="service-request-category-label">{c.label}</span>
                  <span className="service-request-category-desc">{c.description}</span>
                </button>
              ))}
            </div>
          )}

          {step === 'service' && (
            <div className="service-request-services">
              {activeServices.length === 0 ? (
                <p className="service-request-hint">
                  {isAdditionalServices
                    ? 'Add a service on My Services first, then request seats or licenses for it.'
                    : 'No services on file yet. Choose a general option below or add a service first.'}
                </p>
              ) : (
                activeServices.map((svc) => (
                  <button
                    key={svc.id}
                    type="button"
                    className="service-request-service"
                    onClick={() => pickService(svc)}
                  >
                    <span className="service-request-service-name">{svc.name}</span>
                    <span className="service-request-service-vendor">{svc.vendor}</span>
                  </button>
                ))
              )}
              {!isAdditionalServices && (
                <button
                  type="button"
                  className="service-request-service service-request-service--general"
                  onClick={() => {
                    setService({
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
                    });
                    setStep(meta?.selfServiceFirst ? 'guide' : 'details');
                  }}
                >
                  <span className="service-request-service-name">General / not tied to one service</span>
                </button>
              )}
              <button type="button" className="service-request-back" onClick={() => setStep('category')}>
                ← Back
              </button>
            </div>
          )}

          {step === 'guide' && (
            <div className="service-request-guide">
              {loadingGuides ? (
                <p className="service-request-hint">Loading supplier instructions…</p>
              ) : paymentGuide ? (
                <>
                  <p className="service-request-hint">
                    For <strong>{service?.vendor || service?.name}</strong>, you may be able to update billing
                    yourself:
                  </p>
                  <div className="service-request-guide-card">
                    <div className="service-request-guide-title">{paymentGuide.title}</div>
                    <RichTextContent content={paymentGuide.content} />
                  </div>
                  <div className="service-request-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={submitting}
                      onClick={() => void finish('self_service')}
                    >
                      {submitting ? 'Saving…' : 'This solved my issue'}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={submitting}
                      onClick={() => setStep('details')}
                    >
                      I still need help from Candid
                    </button>
                  </div>
                </>
              ) : (
                <p className="service-request-hint">
                  We don&apos;t have self-service steps for this supplier yet. Tell us what you need below.
                </p>
              )}
              {!loadingGuides && !paymentGuide && (
                <button type="button" className="btn-primary" onClick={() => setStep('details')}>
                  Continue
                </button>
              )}
              <button
                type="button"
                className="service-request-back"
                onClick={() => setStep(initialService ? 'category' : 'service')}
              >
                ← Back
              </button>
            </div>
          )}

          {step === 'details' && meta && (
            <div className="service-request-details">
              {service && (
                <p className="service-request-context">
                  <strong>{service.name}</strong>
                  {service.vendor ? ` · ${service.vendor}` : ''}
                </p>
              )}
              <p className="service-request-hint">{meta.detailPrompt}</p>

              {isAdditionalServices ? (
                <div className="service-request-additional">
                  <label className="service-request-field">
                    <span>How many to add *</span>
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
                      placeholder="e.g. Vonage extensions, Microsoft Business licenses"
                    />
                  </label>
                  <label className="service-request-field">
                    <span>Who is this for? (names) *</span>
                    <textarea
                      value={additionalDraft.people}
                      onChange={(e) => setAdditionalField('people', e.target.value)}
                      rows={2}
                      placeholder="e.g. Jane Doe, John Smith"
                    />
                  </label>
                  <label className="service-request-field">
                    <span>Their email addresses *</span>
                    <textarea
                      value={additionalDraft.emails}
                      onChange={(e) => setAdditionalField('emails', e.target.value)}
                      rows={2}
                      placeholder="e.g. jane@company.com, john@company.com"
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
                  <label className="service-request-field">
                    <span>Anything else we should know?</span>
                    <textarea
                      value={additionalDraft.notes}
                      onChange={(e) => setAdditionalField('notes', e.target.value)}
                      rows={3}
                      placeholder="Access needs, departments, preferred start date details…"
                    />
                  </label>
                </div>
              ) : (
                <textarea
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    if (error) setError('');
                  }}
                  rows={5}
                  placeholder="Share details so Hank and our team can help quickly…"
                  className="service-request-textarea"
                />
              )}

              <p className="service-request-sla">
                If we need to step in, we aim to respond within {MEMBER_RESPONSE_SLA_HOURS} hours.
              </p>
              {error ? <p className="service-request-error">{error}</p> : null}
              <div className="service-request-actions">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={submitting}
                  onClick={() => void finish('escalated')}
                >
                  {submitting ? 'Submitting…' : 'Send to Candid team'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onClose}
                  disabled={submitting}
                >
                  Cancel
                </button>
              </div>
              <button
                type="button"
                className="service-request-back"
                onClick={() => {
                  if (meta.selfServiceFirst && paymentGuide) setStep('guide');
                  else if (initialService) setStep('category');
                  else setStep('service');
                }}
              >
                ← Back
              </button>
            </div>
          )}

          {step === 'done' && (
            <div className="service-request-done">
              <div className="service-request-done-icon">
                <AppIcon name="check" size={32} />
              </div>
              <p>{doneCopy}</p>
              <button type="button" className="btn-primary" onClick={onClose}>
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
