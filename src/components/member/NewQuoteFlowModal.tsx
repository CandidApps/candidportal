'use client';

import { useEffect, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import type { Location } from '@/components/CustomersView';
import {
  emptyQuoteDraft,
  QUOTE_SERVICE_TYPES,
  quoteServiceById,
  quoteServiceForCategory,
  type NewQuoteDraft,
} from '@/lib/quote-flow-config';
import type { SolutionCategoryId } from '@/lib/solutions/catalog';
import { notifyActionCenterRefresh } from '@/lib/action-center-refresh';
import { MEMBER_RESPONSE_SLA_HOURS, CANDID_MEMBER_CONTACT_EMAIL, CANDID_SCHEDULING_URL } from '@/lib/member-request-sla';

type Step = 'info' | 'service' | 'vendors' | 'confirm';

const QUOTE_DRAFT_STORAGE_KEY = 'candid-portal-new-quote-draft';

type SavedQuoteDraft = {
  draft: NewQuoteDraft;
  step: Step;
  savedAt: string;
};

function loadSavedQuoteDraft(): SavedQuoteDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(QUOTE_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedQuoteDraft;
    if (!parsed?.draft || !parsed.step) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistQuoteDraft(draft: NewQuoteDraft, step: Step) {
  if (typeof window === 'undefined') return;
  const payload: SavedQuoteDraft = { draft, step, savedAt: new Date().toISOString() };
  localStorage.setItem(QUOTE_DRAFT_STORAGE_KEY, JSON.stringify(payload));
}

function clearSavedQuoteDraft() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(QUOTE_DRAFT_STORAGE_KEY);
}

const INFO_REQUIRED_FIELDS = ['contactName', 'company', 'email', 'phone', 'city', 'state'] as const;

function isServiceAnswerFilled(
  type: string,
  val: string | boolean | undefined,
): boolean {
  if (type === 'boolean') return typeof val === 'boolean';
  return String(val ?? '').trim().length > 0;
}

function missingInfoFields(draft: NewQuoteDraft): Set<string> {
  const missing = new Set<string>();
  for (const key of INFO_REQUIRED_FIELDS) {
    if (!String(draft[key] ?? '').trim()) missing.add(key);
  }
  return missing;
}

function missingServiceFields(draft: NewQuoteDraft): Set<string> {
  const missing = new Set<string>();
  if (!draft.serviceTypeId) missing.add('serviceTypeId');
  const service = quoteServiceById(draft.serviceTypeId);
  if (!service) return missing;
  for (const q of service.questions.filter((item) => item.required)) {
    if (!isServiceAnswerFilled(q.type, draft.serviceAnswers[q.id])) {
      missing.add(q.id);
    }
  }
  return missing;
}

function fieldClass(invalidFields: Set<string>, id: string, extra = ''): string {
  const base = `nq-field${extra ? ` ${extra}` : ''}`;
  return invalidFields.has(id) ? `${base} nq-field--invalid` : base;
}

export type NewQuoteFlowPrefill = Partial<NewQuoteDraft> & {
  categoryId?: SolutionCategoryId;
};

export function NewQuoteFlowModal({
  onClose,
  onSubmitted,
  prefill,
  customerName,
  customerEmail,
  customerCompany,
}: {
  onClose: () => void;
  onSubmitted?: () => void;
  prefill?: NewQuoteFlowPrefill;
  customerName?: string;
  customerEmail?: string;
  customerCompany?: string;
}) {
  const [step, setStep] = useState<Step>('info');
  const [draft, setDraft] = useState<NewQuoteDraft>(() =>
    emptyQuoteDraft({
      contactName: prefill?.contactName ?? customerName ?? '',
      company: prefill?.company ?? customerCompany ?? '',
      email: prefill?.email ?? customerEmail ?? '',
      phone: prefill?.phone ?? '',
      serviceTypeId:
        prefill?.serviceTypeId ??
        (prefill?.categoryId ? quoteServiceForCategory(prefill.categoryId)?.id ?? '' : ''),
      vendorNames: prefill?.vendorNames ?? [],
      additionalComments: prefill?.additionalComments ?? '',
      ...prefill,
    }),
  );
  const [locations, setLocations] = useState<Location[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [vendorInput, setVendorInput] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(() => new Set());
  const [dirty, setDirty] = useState(false);
  const [closePromptOpen, setClosePromptOpen] = useState(false);
  const [savedDraftOffer, setSavedDraftOffer] = useState<SavedQuoteDraft | null>(null);
  const [saveNotice, setSaveNotice] = useState('');

  useEffect(() => {
    if (!prefill) {
      setSavedDraftOffer(loadSavedQuoteDraft());
    }
  }, [prefill]);

  const markDirty = () => setDirty(true);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/portal/locations')
      .then((r) => r.json())
      .then((json: {
        locations?: Location[];
        contactName?: string;
        companyName?: string;
      }) => {
        if (cancelled) return;
        const locs = json.locations ?? [];
        setLocations(locs);
        const primary = locs.find((l) => l.isPrimary) ?? locs[0];
        setDraft((d) => {
          if (d.locationId || !primary) {
            return {
              ...d,
              contactName: d.contactName || json.contactName || customerName || '',
              company: d.company || json.companyName || customerCompany || '',
            };
          }
          return {
            ...d,
            locationId: primary.id,
            locationLabel: primary.label,
            street: primary.street,
            city: primary.city,
            state: primary.state,
            zip: primary.zip,
            contactName: d.contactName || json.contactName || customerName || '',
            company: d.company || json.companyName || customerCompany || '',
          };
        });
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingLocations(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerCompany, customerName]);

  const service = quoteServiceById(draft.serviceTypeId);

  const clearInvalid = (fieldId: string) => {
    setInvalidFields((prev) => {
      if (!prev.has(fieldId)) return prev;
      const next = new Set(prev);
      next.delete(fieldId);
      return next;
    });
  };

  const patchDraft = <K extends keyof NewQuoteDraft>(key: K, value: NewQuoteDraft[K]) => {
    markDirty();
    setDraft((d) => ({ ...d, [key]: value }));
    clearInvalid(String(key));
  };

  const resumeSavedDraft = () => {
    if (!savedDraftOffer) return;
    setDraft(savedDraftOffer.draft);
    setStep(savedDraftOffer.step);
    setSavedDraftOffer(null);
    setDirty(true);
    setSaveNotice('');
  };

  const dismissSavedDraft = () => {
    clearSavedQuoteDraft();
    setSavedDraftOffer(null);
  };

  const saveForLater = () => {
    persistQuoteDraft(draft, step);
    setSaveNotice('Saved — your progress will be here next time you start a new quote.');
    setClosePromptOpen(false);
    setDirty(false);
  };

  const requestClose = () => {
    if (step === 'confirm') {
      clearSavedQuoteDraft();
      onClose();
      return;
    }
    if (dirty || step !== 'info') {
      setClosePromptOpen(true);
      return;
    }
    onClose();
  };

  const discardAndClose = () => {
    clearSavedQuoteDraft();
    setClosePromptOpen(false);
    onClose();
  };

  const saveAndClose = () => {
    persistQuoteDraft(draft, step);
    setClosePromptOpen(false);
    onClose();
  };

  const tryContinueInfo = () => {
    const missing = missingInfoFields(draft);
    if (missing.size > 0) {
      setInvalidFields(missing);
      return;
    }
    setInvalidFields(new Set());
    setStep('service');
  };

  const tryContinueService = () => {
    const missing = missingServiceFields(draft);
    if (missing.size > 0) {
      setInvalidFields(missing);
      return;
    }
    setInvalidFields(new Set());
    setStep('vendors');
  };

  const selectLocation = (loc: Location) => {
    markDirty();
    setDraft((d) => ({
      ...d,
      locationId: loc.id,
      locationLabel: loc.label,
      street: loc.street,
      city: loc.city,
      state: loc.state,
      zip: loc.zip,
    }));
  };

  const setAnswer = (fieldId: string, value: string | boolean) => {
    markDirty();
    setDraft((d) => ({
      ...d,
      serviceAnswers: { ...d.serviceAnswers, [fieldId]: value },
    }));
    clearInvalid(fieldId);
  };

  const addVendor = () => {
    const name = vendorInput.trim();
    if (!name || draft.vendorNames.includes(name)) return;
    markDirty();
    setDraft((d) => ({ ...d, vendorNames: [...d.vendorNames, name] }));
    setVendorInput('');
  };

  const removeVendor = (name: string) => {
    markDirty();
    setDraft((d) => ({ ...d, vendorNames: d.vendorNames.filter((v) => v !== name) }));
  };

  const submit = async () => {
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/portal/quote-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'request',
          name: draft.contactName.trim(),
          company: draft.company.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim(),
          services: [service?.label ?? draft.serviceTypeId, ...draft.vendorNames].filter(Boolean),
          location: {
            id: draft.locationId,
            label: draft.locationLabel,
            street: draft.street,
            city: draft.city,
            state: draft.state,
            zip: draft.zip,
          },
          serviceTypeId: draft.serviceTypeId,
          serviceAnswers: draft.serviceAnswers,
          vendors: draft.vendorNames,
          note: draft.additionalComments.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? 'Submit failed');
      }
      clearSavedQuoteDraft();
      notifyActionCenterRefresh();
      onSubmitted?.();
      setStep('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay open">
      <div
        className="modal-box nq-modal"
        role="dialog"
        aria-label="New quote request"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-header-left">
            <div className="modal-hank-avatar">
              <AppIcon name="reports" size={18} />
            </div>
            <div>
              <div className="modal-title">New Quote</div>
              <div className="modal-subtitle">
                {step === 'info' && 'Step 1 of 3 — Your info & location'}
                {step === 'service' && 'Step 2 of 3 — Service details'}
                {step === 'vendors' && 'Step 3 of 3 — Vendors & comments'}
                {step === 'confirm' && 'Request submitted'}
              </div>
            </div>
          </div>
          <button type="button" className="modal-close" onClick={requestClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-body nq-body">
          {closePromptOpen ? (
            <div className="nq-close-prompt">
              <h3 className="nq-close-prompt-title">Discard this quote?</h3>
              <p className="nq-lead">
                Closing will clear your progress unless you save for later. You can pick up a saved draft
                the next time you start a new quote.
              </p>
              <div className="nq-close-prompt-actions">
                <button type="button" className="btn-secondary" onClick={() => setClosePromptOpen(false)}>
                  Keep editing
                </button>
                <button type="button" className="btn-secondary" onClick={saveAndClose}>
                  Save for later
                </button>
                <button type="button" className="btn-primary" onClick={discardAndClose}>
                  Discard &amp; close
                </button>
              </div>
            </div>
          ) : (
            <>
          {savedDraftOffer && step === 'info' && !dirty ? (
            <div className="nq-saved-draft-banner">
              <div>
                <strong>Saved quote draft</strong>
                <p className="nq-muted">
                  You have a quote in progress from{' '}
                  {new Date(savedDraftOffer.savedAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  .
                </p>
              </div>
              <div className="nq-saved-draft-actions">
                <button type="button" className="btn-secondary" onClick={dismissSavedDraft}>
                  Start fresh
                </button>
                <button type="button" className="btn-primary" onClick={resumeSavedDraft}>
                  Resume draft
                </button>
              </div>
            </div>
          ) : null}
          {saveNotice ? <div className="nq-save-notice">{saveNotice}</div> : null}
          {step === 'info' && (
            <>
              <p className="nq-lead">
                Request pricing without uploading a bill. We&apos;ll prefill what we know from your account.
              </p>
              <div className="nq-grid">
                {[
                  { label: 'Your name', key: 'contactName' as const, placeholder: 'Jane Smith' },
                  { label: 'Company', key: 'company' as const, placeholder: 'Acme Corp' },
                  { label: 'Email', key: 'email' as const, placeholder: 'jane@acme.com' },
                  { label: 'Phone', key: 'phone' as const, placeholder: '(555) 555-5555' },
                ].map((f) => (
                  <label key={f.key} className={fieldClass(invalidFields, f.key)}>
                    <span className="nq-label">{f.label} *</span>
                    <input
                      className="nq-input"
                      value={draft[f.key]}
                      placeholder={f.placeholder}
                      aria-invalid={invalidFields.has(f.key)}
                      onChange={(e) => patchDraft(f.key, e.target.value)}
                    />
                  </label>
                ))}
              </div>

              {locations.length > 1 && (
                <div className="nq-field">
                  <span className="nq-label">Location</span>
                  <select
                    className="nq-input"
                    value={draft.locationId}
                    onChange={(e) => {
                      const loc = locations.find((l) => l.id === e.target.value);
                      if (loc) selectLocation(loc);
                    }}
                  >
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.label} — {loc.city}, {loc.state}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="nq-grid">
                <label className="nq-field nq-field--wide">
                  <span className="nq-label">Service address</span>
                  <input
                    className="nq-input"
                    value={draft.street}
                    onChange={(e) => {
                      markDirty();
                      setDraft((d) => ({ ...d, street: e.target.value }));
                    }}
                  />
                </label>
                <label className={fieldClass(invalidFields, 'city')}>
                  <span className="nq-label">City *</span>
                  <input
                    className="nq-input"
                    value={draft.city}
                    aria-invalid={invalidFields.has('city')}
                    onChange={(e) => patchDraft('city', e.target.value)}
                  />
                </label>
                <label className={fieldClass(invalidFields, 'state')}>
                  <span className="nq-label">State *</span>
                  <input
                    className="nq-input"
                    value={draft.state}
                    aria-invalid={invalidFields.has('state')}
                    onChange={(e) => patchDraft('state', e.target.value)}
                  />
                </label>
                <label className="nq-field">
                  <span className="nq-label">ZIP</span>
                  <input
                    className="nq-input"
                    value={draft.zip}
                    onChange={(e) => patchDraft('zip', e.target.value)}
                  />
                </label>
              </div>
              {loadingLocations && <p className="nq-muted">Loading your locations…</p>}
            </>
          )}

          {step === 'service' && (
            <>
              <p className="nq-lead">What service do you need a quote for?</p>
              <div
                className={`nq-service-pills${invalidFields.has('serviceTypeId') ? ' nq-section--invalid' : ''}`}
              >
                {invalidFields.has('serviceTypeId') && (
                  <p className="nq-section-error">Select a service type to continue.</p>
                )}
                {QUOTE_SERVICE_TYPES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`q-pill${draft.serviceTypeId === s.id ? ' selected' : ''}`}
                    onClick={() => {
                      markDirty();
                      setDraft((d) => ({ ...d, serviceTypeId: s.id, serviceAnswers: {} }));
                      clearInvalid('serviceTypeId');
                      setInvalidFields((prev) => {
                        const next = new Set(prev);
                        for (const q of quoteServiceById(s.id)?.questions ?? []) {
                          next.delete(q.id);
                        }
                        return next;
                      });
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {service && (
                <div className="nq-questions">
                  {service.questions.map((q) => (
                    <label
                      key={q.id}
                      className={fieldClass(invalidFields, q.id, 'nq-field--wide')}
                    >
                      <span className="nq-label">
                        {q.label}
                        {q.required ? ' *' : ''}
                      </span>
                      {q.type === 'select' && q.options ? (
                        <select
                          className="nq-input"
                          value={String(draft.serviceAnswers[q.id] ?? '')}
                          aria-invalid={invalidFields.has(q.id)}
                          onChange={(e) => setAnswer(q.id, e.target.value)}
                        >
                          <option value="">Select…</option>
                          {q.options.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : q.type === 'boolean' ? (
                        <div
                          className={`nq-bool-row${invalidFields.has(q.id) ? ' nq-bool-row--invalid' : ''}`}
                          aria-invalid={invalidFields.has(q.id)}
                        >
                          <label className="nq-bool-opt">
                            <input
                              type="radio"
                              name={q.id}
                              checked={draft.serviceAnswers[q.id] === true}
                              onChange={() => setAnswer(q.id, true)}
                            />
                            Yes
                          </label>
                          <label className="nq-bool-opt">
                            <input
                              type="radio"
                              name={q.id}
                              checked={draft.serviceAnswers[q.id] === false}
                              onChange={() => setAnswer(q.id, false)}
                            />
                            No
                          </label>
                        </div>
                      ) : q.type === 'textarea' ? (
                        <textarea
                          className="nq-input nq-textarea"
                          rows={3}
                          placeholder={q.placeholder}
                          aria-invalid={invalidFields.has(q.id)}
                          value={String(draft.serviceAnswers[q.id] ?? '')}
                          onChange={(e) => setAnswer(q.id, e.target.value)}
                        />
                      ) : (
                        <input
                          className="nq-input"
                          type={q.type === 'number' ? 'number' : q.type === 'date' ? 'date' : 'text'}
                          placeholder={q.placeholder}
                          aria-invalid={invalidFields.has(q.id)}
                          value={String(draft.serviceAnswers[q.id] ?? '')}
                          onChange={(e) => setAnswer(q.id, e.target.value)}
                        />
                      )}
                      {q.hint ? <span className="nq-hint">{q.hint}</span> : null}
                    </label>
                  ))}
                </div>
              )}
            </>
          )}

          {step === 'vendors' && (
            <>
              <p className="nq-lead">
                Request quotes from specific vendors (optional). Add any from Find Solutions or type a name.
              </p>
              <div className="nq-vendor-add">
                <input
                  className="nq-input"
                  placeholder="Vendor name — e.g. RingCentral, Comcast Business"
                  value={vendorInput}
                  onChange={(e) => setVendorInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addVendor())}
                />
                <button type="button" className="btn-secondary" onClick={addVendor}>
                  Add
                </button>
              </div>
              {draft.vendorNames.length > 0 && (
                <div className="nq-vendor-chips">
                  {draft.vendorNames.map((name) => (
                    <span key={name} className="nq-vendor-chip">
                      {name}
                      <button type="button" aria-label={`Remove ${name}`} onClick={() => removeVendor(name)}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <label className="nq-field nq-field--wide">
                <span className="nq-label">Additional comments</span>
                <textarea
                  className="nq-input nq-textarea"
                  rows={4}
                  placeholder="Timeline, must-haves, number of locations, anything else for our team…"
                  value={draft.additionalComments}
                  onChange={(e) => {
                    markDirty();
                    setDraft((d) => ({ ...d, additionalComments: e.target.value }));
                  }}
                />
              </label>
            </>
          )}

          {step === 'confirm' && (
            <div className="nq-confirm">
              <div className="nq-confirm-icon">
                <AppIcon name="check" size={36} />
              </div>
              <h3 className="nq-confirm-title">Quote request sent</h3>
              <p className="nq-lead">
                Thanks, <strong>{draft.contactName}</strong>. We&apos;ll follow up at{' '}
                <strong>{draft.email}</strong> within {MEMBER_RESPONSE_SLA_HOURS} hours
                {service ? ` about ${service.label}` : ''}
                {draft.vendorNames.length ? ` (${draft.vendorNames.join(', ')})` : ''}.
              </p>
              <p className="nq-lead" style={{ marginTop: 12, fontSize: 13 }}>
                If this is urgent, contact{' '}
                <a href={`mailto:${CANDID_MEMBER_CONTACT_EMAIL}`}>{CANDID_MEMBER_CONTACT_EMAIL}</a> or{' '}
                <a href={CANDID_SCHEDULING_URL} target="_blank" rel="noreferrer">
                  schedule on our calendar
                </a>
                .
              </p>
            </div>
          )}

          {error ? <div className="nq-error">{error}</div> : null}

          {step !== 'confirm' && (
            <div className="nq-actions">
              {step !== 'info' ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setInvalidFields(new Set());
                    setStep(step === 'vendors' ? 'service' : 'info');
                  }}
                >
                  Back
                </button>
              ) : null}
              {(dirty || step !== 'info') && (
                <button type="button" className="btn-secondary" onClick={saveForLater}>
                  Save for later
                </button>
              )}
              {step === 'info' && (
                <button type="button" className="btn-primary" onClick={tryContinueInfo}>
                  Continue →
                </button>
              )}
              {step === 'service' && (
                <button type="button" className="btn-primary" onClick={tryContinueService}>
                  Continue →
                </button>
              )}
              {step === 'vendors' && (
                <button type="button" className="btn-primary" disabled={submitting} onClick={() => void submit()}>
                  {submitting ? 'Submitting…' : 'Submit quote request →'}
                </button>
              )}
            </div>
          )}

          {step === 'confirm' && (
            <button type="button" className="btn-primary nq-done" onClick={requestClose}>
              Done
            </button>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
