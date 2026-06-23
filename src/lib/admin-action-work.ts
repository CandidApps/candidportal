import type { AdminTicketKind } from '@/lib/admin-tickets';

export type TeamMember = {
  id: string;
  email: string;
  displayName: string;
  handle: string;
};

export type ActionWorkState = {
  actionKey: string;
  actionKind: AdminTicketKind;
  sourceId: string;
  claimedById: string | null;
  claimedByName: string | null;
  claimedAt: string | null;
  assigneeIds: string[];
  assigneeNames: string[];
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
  ticket: { kind: AdminTicketKind; sourceId: string; claimedById?: string | null; assigneeIds?: string[] },
  userId: string | undefined,
): boolean {
  if (!userId) return false;
  if (ticket.claimedById === userId) return true;
  return ticket.assigneeIds?.includes(userId) ?? false;
}

export function mergeActionWorkIntoTickets<
  T extends { kind: AdminTicketKind; sourceId: string },
>(
  tickets: T[],
  workByKey: Record<string, ActionWorkState>,
): (T & {
  actionKey: string;
  claimedById: string | null;
  claimedByName: string | null;
  assigneeIds: string[];
  assigneeNames: string[];
})[] {
  return tickets.map((ticket) => {
    const actionKey = buildActionKey(ticket.kind, ticket.sourceId);
    const work = workByKey[actionKey];
    return {
      ...ticket,
      actionKey,
      claimedById: work?.claimedById ?? null,
      claimedByName: work?.claimedByName ?? null,
      assigneeIds: work?.assigneeIds ?? [],
      assigneeNames: work?.assigneeNames ?? [],
    };
  });
}
