/** Client-side "save for later" drafts for the member New Quote modal. */

import type { NewQuoteDraft } from '@/lib/quote-flow-config';

export const QUOTE_DRAFT_STORAGE_KEY = 'candid-portal-new-quote-draft';
export const QUOTE_DRAFT_CHANGED_EVENT = 'candid:quote-draft-changed';

export type QuoteFlowStep = 'info' | 'service' | 'vendors' | 'confirm';

export type SavedQuoteDraft = {
  draft: NewQuoteDraft;
  step: QuoteFlowStep;
  savedAt: string;
};

export type QuoteBillAttachment = {
  filename: string;
  storagePath: string;
  size: number;
};

function notifyDraftChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(QUOTE_DRAFT_CHANGED_EVENT));
}

export function loadSavedQuoteDraft(): SavedQuoteDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(QUOTE_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedQuoteDraft;
    if (!parsed?.draft || !parsed.step || parsed.step === 'confirm') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hasSavedQuoteDraft(): boolean {
  return Boolean(loadSavedQuoteDraft());
}

export function persistQuoteDraft(draft: NewQuoteDraft, step: QuoteFlowStep) {
  if (typeof window === 'undefined') return;
  if (step === 'confirm') {
    clearSavedQuoteDraft();
    return;
  }
  const payload: SavedQuoteDraft = { draft, step, savedAt: new Date().toISOString() };
  localStorage.setItem(QUOTE_DRAFT_STORAGE_KEY, JSON.stringify(payload));
  notifyDraftChanged();
}

export function clearSavedQuoteDraft() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(QUOTE_DRAFT_STORAGE_KEY);
  notifyDraftChanged();
}

export function describeSavedQuoteDraft(saved: SavedQuoteDraft): string {
  const svc = saved.draft.serviceTypeId?.trim();
  const company = saved.draft.company?.trim();
  const parts = [
    svc ? svc.replace(/_/g, ' ') : 'Quote request',
    company || null,
  ].filter(Boolean);
  return parts.join(' · ');
}
