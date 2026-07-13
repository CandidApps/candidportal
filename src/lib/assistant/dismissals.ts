import type { AssistantRef } from '@/lib/assistant/types';

export type AssistantDismissalRefType =
  | 'call'
  | 'call_contact'
  | 'action'
  | 'email'
  | 'mention'
  | 'priority_title'
  | 'missed_title';

export type AssistantDismissal = {
  id: string;
  refType: AssistantDismissalRefType;
  refId: string;
  title: string | null;
  createdAt: string;
};

export function normalizeCallContactKey(phoneOrName: string): string {
  const digits = phoneOrName.replace(/\D/g, '');
  if (digits.length >= 7) return `phone:${digits.slice(-10)}`;
  return `name:${phoneOrName.trim().toLowerCase()}`;
}

/** Keys used by the assistant UI to hide completed brief rows. */
export function dismissalUiKeys(input: {
  title: string;
  ref?: AssistantRef | null;
  contactKey?: string | null;
}): string[] {
  const keys = new Set<string>();
  const title = input.title.trim();
  if (title) {
    keys.add(`priority:${title}`);
    keys.add(`missed:${title}`);
  }
  const refId = refIdOf(input.ref);
  if (input.ref?.type && refId) {
    keys.add(`${input.ref.type}:${refId}`);
  }
  if (input.contactKey) {
    keys.add(`call_contact:${input.contactKey}`);
  }
  return [...keys];
}

function refIdOf(ref?: AssistantRef | null): string | null {
  if (!ref) return null;
  if ('id' in ref && typeof ref.id === 'string' && ref.id) return ref.id;
  return null;
}

export function filterMissedCallsByDismissals<
  T extends { id: string; contactPhone?: string | null; contactName?: string | null },
>(calls: T[], dismissals: AssistantDismissal[]): T[] {
  const callIds = new Set(
    dismissals.filter((d) => d.refType === 'call').map((d) => d.refId),
  );
  const contacts = new Set(
    dismissals.filter((d) => d.refType === 'call_contact').map((d) => d.refId),
  );
  if (callIds.size === 0 && contacts.size === 0) return calls;

  return calls.filter((c) => {
    if (callIds.has(c.id)) return false;
    if (c.contactPhone && contacts.has(normalizeCallContactKey(c.contactPhone))) return false;
    if (c.contactName && contacts.has(normalizeCallContactKey(c.contactName))) return false;
    return true;
  });
}

export function isBriefItemDismissed(
  item: { title: string; ref?: AssistantRef | null },
  completedKeys: Set<string>,
): boolean {
  if (completedKeys.has(`priority:${item.title}`) || completedKeys.has(`missed:${item.title}`)) {
    return true;
  }
  const refId = refIdOf(item.ref);
  if (item.ref?.type && refId && completedKeys.has(`${item.ref.type}:${refId}`)) {
    return true;
  }
  return false;
}
