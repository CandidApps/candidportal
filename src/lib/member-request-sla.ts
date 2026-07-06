export const MEMBER_RESPONSE_SLA_HOURS = 48;

export const MEMBER_RESPONSE_SLA_MS = MEMBER_RESPONSE_SLA_HOURS * 60 * 60 * 1000;

export type MemberSlaStatus = 'ok' | 'approaching' | 'breached';

export const CANDID_MEMBER_CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CANDID_CONTACT_EMAIL?.trim() || 'support@candid.solutions';

export const CANDID_SCHEDULING_URL =
  process.env.NEXT_PUBLIC_CANDID_SCHEDULING_URL?.trim() || 'https://candid.solutions';

/** Wall-clock SLA deadline from submission time. */
export function memberResponseDueAt(createdAt: string): Date {
  const start = new Date(createdAt);
  if (Number.isNaN(start.getTime())) return new Date(Date.now() + MEMBER_RESPONSE_SLA_MS);
  return new Date(start.getTime() + MEMBER_RESPONSE_SLA_MS);
}

export function memberSlaStatus(createdAt: string, now = Date.now()): MemberSlaStatus {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return 'ok';
  const elapsedHours = (now - created) / (60 * 60 * 1000);
  if (elapsedHours >= MEMBER_RESPONSE_SLA_HOURS) return 'breached';
  if (elapsedHours >= 24) return 'approaching';
  return 'ok';
}

export function formatMemberSlaDueLabel(createdAt: string, now = Date.now()): string {
  const status = memberSlaStatus(createdAt, now);
  const due = memberResponseDueAt(createdAt);

  if (status === 'breached') {
    return 'We’re still on it — thank you for your patience';
  }

  const remainingMs = due.getTime() - now;
  if (remainingMs <= 0) {
    return 'Response expected very soon';
  }

  const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
  if (remainingHours <= 24) {
    return `Response expected within ${remainingHours} hour${remainingHours === 1 ? '' : 's'}`;
  }

  return `Response expected by ${due.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

export function memberSlaSummaryCopy(): string {
  return `We aim to respond within ${MEMBER_RESPONSE_SLA_HOURS} hours.`;
}
