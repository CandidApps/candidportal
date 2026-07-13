import type { ZohoEventAttendee } from '@/lib/calendar/zoho-calendar';
import { getMessageContent, listInboxMessages } from '@/lib/email/zoho';

const INVITE_SUBJECT =
  /\b(invitation|invited|canceled event|cancelled event|accepted:|declined:|tentative:)\b/i;

function cleanStr(v: unknown): string {
  return String(v ?? '').trim();
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  if (!local) return 'Guest';
  return local
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function mapPartStat(raw: string): ZohoEventAttendee['status'] {
  const s = raw.toLowerCase();
  if (s.includes('accept')) return 'accepted';
  if (s.includes('declin')) return 'declined';
  if (s.includes('tentat')) return 'tentative';
  return 'pending';
}

/** Pull ATTENDEE / ORGANIZER lines out of ICS text embedded in invite emails. */
export function parseIcsAttendees(ics: string): ZohoEventAttendee[] {
  const out: ZohoEventAttendee[] = [];
  const lines = ics.replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    if (!/^ATTENDEE/i.test(line) && !/^ORGANIZER/i.test(line)) continue;
    const isOrganizer = /^ORGANIZER/i.test(line);
    const mailto = line.match(/mailto:([^;\s]+)/i)?.[1]?.trim().toLowerCase();
    if (!mailto || !mailto.includes('@')) continue;
    const cn = line.match(/(?:^|[;])CN=([^;:]+)/i)?.[1]?.trim();
    const partstat = line.match(/PARTSTAT=([^;:]+)/i)?.[1]?.trim() ?? '';
    out.push({
      email: mailto,
      name: cn || nameFromEmail(mailto),
      status: mapPartStat(partstat),
      isOrganizer,
    });
  }
  return out;
}

function extractIcsBlocks(text: string): string[] {
  const blocks: string[] = [];
  const re = /BEGIN:VCALENDAR[\s\S]*?END:VCALENDAR/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    blocks.push(m[0]!);
  }
  return blocks;
}

function uidFromIcs(ics: string): string | null {
  const m = ics.match(/^UID:(.+)$/im);
  return m?.[1]?.trim() ?? null;
}

function normalizeUid(uid: string): string {
  return uid.trim().toLowerCase();
}

function mergeAttendees(...lists: ZohoEventAttendee[][]): ZohoEventAttendee[] {
  const seen = new Map<string, ZohoEventAttendee>();
  for (const list of lists) {
    for (const a of list) {
      const key = a.email?.toLowerCase() || a.name.toLowerCase();
      if (!key) continue;
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, { ...a });
        continue;
      }
      if (!existing.name && a.name) existing.name = a.name;
      if (!existing.email && a.email) existing.email = a.email;
      if (a.isOrganizer) existing.isOrganizer = true;
      if (existing.status === 'pending' && a.status !== 'pending') existing.status = a.status;
    }
  }
  return [...seen.values()];
}

function parseHeaderRecipients(raw: string): ZohoEventAttendee[] {
  const out: ZohoEventAttendee[] = [];
  for (const part of raw.split(/[,;]/)) {
    const email = part.match(/<([^>]+)>/)?.[1]?.trim() || part.trim();
    if (!email.includes('@')) continue;
    out.push({ email, name: nameFromEmail(email), status: 'pending' });
  }
  return out;
}

type InviteAttendeeMap = Map<string, ZohoEventAttendee[]>;

/**
 * When Zoho's calendar API hides other guests (common for participant-role
 * events), calendar invite emails in the mailbox often still contain the full
 * guest list in embedded ICS or To/Cc headers.
 */
export async function buildInviteAttendeeMap(input: {
  accessToken: string;
  accountId: string;
  maxMessages?: number;
}): Promise<InviteAttendeeMap> {
  const map: InviteAttendeeMap = new Map();
  const messages = await listInboxMessages({
    accessToken: input.accessToken,
    accountId: input.accountId,
    limit: input.maxMessages ?? 120,
  });

  const candidates = messages.filter((m) => INVITE_SUBJECT.test(m.subject)).slice(0, 24);
  await Promise.all(
    candidates.map(async (msg) => {
      try {
        const html = await getMessageContent({
          accessToken: input.accessToken,
          accountId: input.accountId,
          folderId: msg.folderId,
          messageId: msg.messageId,
        });
        const headerAttendees = mergeAttendees(
          parseHeaderRecipients(msg.toAddress),
          parseHeaderRecipients(msg.ccAddress),
        );
        const blocks = extractIcsBlocks(html);
        if (!blocks.length) {
          if (headerAttendees.length) {
            const key = normalizeUid(msg.subject.toLowerCase());
            map.set(key, mergeAttendees(map.get(key) ?? [], headerAttendees));
          }
          return;
        }
        for (const block of blocks) {
          const uid = uidFromIcs(block);
          const attendees = mergeAttendees(parseIcsAttendees(block), headerAttendees);
          if (!uid || !attendees.length) continue;
          map.set(normalizeUid(uid), mergeAttendees(map.get(normalizeUid(uid)) ?? [], attendees));
        }
      } catch {
        /* skip message */
      }
    }),
  );

  return map;
}

export function inviteAttendeesForEvent(
  event: { id: string; title: string; attendees: ZohoEventAttendee[] },
  inviteMap: InviteAttendeeMap,
): ZohoEventAttendee[] {
  const uidKey = normalizeUid(event.id);
  const direct = inviteMap.get(uidKey);
  if (direct?.length) return direct;

  const titleKey = event.title.trim().toLowerCase();
  for (const [key, attendees] of inviteMap) {
    if (key.includes(titleKey) || titleKey.includes(key)) return attendees;
  }
  return [];
}

export async function enrichEventsFromInviteEmails(input: {
  accessToken: string;
  accountId: string;
  events: Array<{
    id: string;
    title: string;
    attendees: ZohoEventAttendee[];
    attendeeCount: number;
    attendeesComplete: boolean;
  }>;
}): Promise<void> {
  const sparse = input.events.filter((e) => e.attendees.length <= 2);
  if (!sparse.length) return;

  const inviteMap = await buildInviteAttendeeMap({
    accessToken: input.accessToken,
    accountId: input.accountId,
  });
  if (!inviteMap.size) return;

  for (const ev of sparse) {
    const fromInvite = inviteAttendeesForEvent(ev, inviteMap);
    if (fromInvite.length <= ev.attendees.length) continue;
    ev.attendees = mergeAttendees(ev.attendees, fromInvite);
    ev.attendeeCount = ev.attendees.length;
    ev.attendeesComplete = true;
  }
}
