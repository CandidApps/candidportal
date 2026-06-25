import type { AdminTicketKind } from '@/lib/admin-tickets';

export type TeamMember = {
  id: string;
  email: string;
  displayName: string;
  handle: string;
};

export type ActionAssignee = {
  userId: string;
  name: string;
  /** Who put this person on the action (null for legacy rows). */
  assignedById: string | null;
  /** True when assigned by a different teammate (pending until claimed/rejected). */
  assignedByOther: boolean;
  /** True once the person has claimed the action (rendered green). */
  claimed: boolean;
  claimedAt: string | null;
};

export type ActionWorkState = {
  actionKey: string;
  actionKind: AdminTicketKind;
  sourceId: string;
  assignees: ActionAssignee[];
  /** All people on the action (claimed or pending). */
  assigneeIds: string[];
  assigneeNames: string[];
  /** Subset actively working (claimed) — these render green. */
  claimerIds: string[];
  claimerNames: string[];
  /** Latest activity timestamp across assignment/claim events. */
  lastActivityAt: string | null;
};

export function buildActionKey(kind: AdminTicketKind, sourceId: string): string {
  return `${kind}:${sourceId}`;
}

export function slugHandle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/@.+$/, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

export function teamMemberHandle(member: Pick<TeamMember, 'email' | 'displayName'>): string {
  const fromEmail = member.email.split('@')[0]?.trim();
  if (fromEmail) return slugHandle(fromEmail);
  return slugHandle(member.displayName || 'user');
}

export function parseMentionHandles(body: string): string[] {
  const handles = new Set<string>();
  const pattern = /@([a-zA-Z0-9._-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    handles.add(match[1]!.toLowerCase());
  }
  return [...handles];
}

export function resolveMentionUserIds(body: string, members: TeamMember[]): string[] {
  const handles = parseMentionHandles(body);
  const ids = new Set<string>();
  for (const handle of handles) {
    const member = members.find((m) => {
      const candidates = [
        m.handle.toLowerCase(),
        slugHandle(m.email),
        slugHandle(m.displayName),
        m.email.split('@')[0]?.toLowerCase(),
      ].filter(Boolean);
      return candidates.includes(handle);
    });
    if (member) ids.add(member.id);
  }
  return [...ids];
}

export function renderNoteBody(body: string, members: TeamMember[]): string {
  return body.replace(/@([a-zA-Z0-9._-]+)/g, (full, raw: string) => {
    const handle = raw.toLowerCase();
    const member = members.find((m) => {
      const candidates = [
        m.handle.toLowerCase(),
        slugHandle(m.email),
        slugHandle(m.displayName),
        m.email.split('@')[0]?.toLowerCase(),
      ].filter(Boolean);
      return candidates.includes(handle);
    });
    if (!member) return full;
    const label = member.displayName || member.email;
    return `<span class="team-note-mention">@${raw}</span> <span class="team-note-mention-name">(${label})</span>`;
  });
}

export function isTicketMine(
  ticket: { kind: AdminTicketKind; sourceId: string; assigneeIds?: string[] },
  userId: string | undefined,
): boolean {
  if (!userId) return false;
  return ticket.assigneeIds?.includes(userId) ?? false;
}

function latestIso(...values: (string | null | undefined)[]): string | undefined {
  let best: string | undefined;
  let bestTime = -Infinity;
  for (const value of values) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (!Number.isNaN(time) && time > bestTime) {
      bestTime = time;
      best = value;
    }
  }
  return best;
}

export function mergeActionWorkIntoTickets<
  T extends {
    kind: AdminTicketKind;
    sourceId: string;
    createdAt?: string;
    updatedAt?: string;
  },
>(
  tickets: T[],
  workByKey: Record<string, ActionWorkState>,
): (T & {
  actionKey: string;
  assignees: ActionAssignee[];
  assigneeIds: string[];
  assigneeNames: string[];
  claimerIds: string[];
  claimerNames: string[];
  lastModifiedAt?: string;
})[] {
  return tickets.map((ticket) => {
    const actionKey = buildActionKey(ticket.kind, ticket.sourceId);
    const work = workByKey[actionKey];
    return {
      ...ticket,
      actionKey,
      assignees: work?.assignees ?? [],
      assigneeIds: work?.assigneeIds ?? [],
      assigneeNames: work?.assigneeNames ?? [],
      claimerIds: work?.claimerIds ?? [],
      claimerNames: work?.claimerNames ?? [],
      lastModifiedAt:
        latestIso(ticket.updatedAt, ticket.createdAt, work?.lastActivityAt) ??
        ticket.updatedAt ??
        ticket.createdAt,
    };
  });
}
