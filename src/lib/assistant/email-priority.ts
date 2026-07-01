import type { AssistantEmailItem, TriagedEmail } from '@/lib/assistant/types';

const STORAGE_KEY = 'assist-manual-priority-emails';

export type ManualPriorityEmail = TriagedEmail & {
  manual: true;
  pinnedAt: string;
};

export function loadManualPriorityEmails(): ManualPriorityEmail[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ManualPriorityEmail[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveManualPriorityEmails(items: ManualPriorityEmail[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

export function triagedFromInbox(
  item: AssistantEmailItem,
  meta: {
    contactName: string;
    contactEmail: string;
    account: string | null;
    vendor: string | null;
  },
): TriagedEmail {
  const org = meta.account ?? meta.vendor ?? '';
  return {
    id: item.id,
    contact: meta.contactName,
    business: org,
    title: item.subject || '(no subject)',
    subject: item.subject,
    insight: item.summary?.trim() || 'Manually marked as priority.',
    tag: 'customer',
    section: 'action',
    fromAddress: meta.contactEmail,
    folderId: item.folderId,
    receivedTime: item.receivedTime,
  };
}
