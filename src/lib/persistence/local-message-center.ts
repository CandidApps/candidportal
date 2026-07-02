import type { MessageAttachment } from '@/app/api/portal/message-center/route';
import { newLocalId } from '@/lib/persistence/local-data-store';

const STORAGE_KEY = 'candid-local-message-center-v1';

export type LocalCustomerMessageThread = {
  id: string;
  user_id: string;
  subject: string | null;
  category: string;
  status: string;
  critical: boolean;
  supplier_name: string | null;
  analysis_review_id: string | null;
  quote_request_id: string | null;
  created_at: string;
  updated_at: string;
};

export type LocalCustomerMessage = {
  id: string;
  thread_id: string;
  user_id: string;
  author: 'customer' | 'ai' | 'team';
  body: string;
  attachments: MessageAttachment[];
  created_at: string;
};

type LocalMessageCenterSnapshot = {
  threads: LocalCustomerMessageThread[];
  messages: LocalCustomerMessage[];
};

function readSnapshot(): LocalMessageCenterSnapshot {
  if (typeof window === 'undefined') return { threads: [], messages: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { threads: [], messages: [] };
    const parsed = JSON.parse(raw) as LocalMessageCenterSnapshot;
    return {
      threads: parsed.threads ?? [],
      messages: parsed.messages ?? [],
    };
  } catch {
    return { threads: [], messages: [] };
  }
}

function writeSnapshot(snapshot: LocalMessageCenterSnapshot): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

export function listLocalCustomerThreads(userId: string): LocalCustomerMessageThread[] {
  return readSnapshot()
    .threads.filter((t) => t.user_id === userId)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function listLocalCustomerMessages(threadIds: string[]): LocalCustomerMessage[] {
  const set = new Set(threadIds);
  return readSnapshot()
    .messages.filter((m) => set.has(m.thread_id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function findLocalThreadByAnalysisReview(
  userId: string,
  analysisReviewId: string,
): LocalCustomerMessageThread | null {
  return (
    readSnapshot().threads.find(
      (t) => t.user_id === userId && t.analysis_review_id === analysisReviewId,
    ) ?? null
  );
}

export function findLocalThreadByQuoteRequest(
  userId: string,
  quoteRequestId: string,
): LocalCustomerMessageThread | null {
  return (
    readSnapshot().threads.find(
      (t) => t.user_id === userId && t.quote_request_id === quoteRequestId,
    ) ?? null
  );
}

export function appendLocalCustomerTeamMessage(params: {
  userId: string;
  subject: string;
  category: string;
  supplierName?: string;
  analysisReviewId?: string;
  quoteRequestId?: string;
  body: string;
}): string {
  const snap = readSnapshot();
  const now = new Date().toISOString();
  const threadId = newLocalId();
  const thread: LocalCustomerMessageThread = {
    id: threadId,
    user_id: params.userId,
    subject: params.subject,
    category: params.category,
    status: 'open',
    critical: false,
    supplier_name: params.supplierName ?? null,
    analysis_review_id: params.analysisReviewId ?? null,
    quote_request_id: params.quoteRequestId ?? null,
    created_at: now,
    updated_at: now,
  };
  const message: LocalCustomerMessage = {
    id: newLocalId(),
    thread_id: threadId,
    user_id: params.userId,
    author: 'team',
    body: params.body,
    attachments: [],
    created_at: now,
  };
  snap.threads = [thread, ...snap.threads.filter((t) => t.id !== threadId)];
  snap.messages = [...snap.messages, message];
  writeSnapshot(snap);
  return threadId;
}

export function appendLocalCustomerMessage(params: {
  userId: string;
  threadId?: string;
  subject?: string;
  category?: string;
  critical?: boolean;
  supplierName?: string;
  body: string;
  author: 'customer' | 'ai' | 'team';
}): string {
  const snap = readSnapshot();
  const now = new Date().toISOString();
  let threadId = params.threadId;

  if (!threadId) {
    threadId = newLocalId();
    const thread: LocalCustomerMessageThread = {
      id: threadId,
      user_id: params.userId,
      subject: params.subject?.trim() || params.body.slice(0, 80) || 'New message',
      category: params.category ?? 'general',
      status: 'open',
      critical: Boolean(params.critical),
      supplier_name: params.supplierName ?? null,
      analysis_review_id: null,
      quote_request_id: null,
      created_at: now,
      updated_at: now,
    };
    snap.threads = [thread, ...snap.threads.filter((t) => t.id !== threadId)];
  } else {
    snap.threads = snap.threads.map((t) =>
      t.id === threadId ? { ...t, updated_at: now, critical: params.critical ?? t.critical } : t,
    );
  }

  const message: LocalCustomerMessage = {
    id: newLocalId(),
    thread_id: threadId,
    user_id: params.userId,
    author: params.author,
    body: params.body,
    attachments: [],
    created_at: now,
  };
  snap.messages = [...snap.messages, message];
  writeSnapshot(snap);
  return threadId;
}
