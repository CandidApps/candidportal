import type { ZohoEventAttendee } from '@/lib/calendar/zoho-calendar';
import {
  downloadMessageAttachment,
  getMessageAttachments,
  getMessageContent,
  listInboxMessages,
  zohoConfig,
  type InboxMessage,
} from '@/lib/email/zoho';

const INVITE_SUBJECT =
  /\b(invitation|invited you|updated invitation|canceled event|cancelled event|accepted:|declined:|tentative:|calendar invite|meeting invite)\b/i;

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Zoho-oauthtoken ${accessToken}`,
    Accept: 'application/json',
  };
}

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

/** RFC 5545 line unfolding: soft line breaks are CRLF + space/tab. */
export function unfoldIcs(ics: string): string {
  return ics.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

function decodeIcsText(raw: string): string {
  return raw
    .replace(/^"|"$/g, '')
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

/** Pull ATTENDEE / ORGANIZER lines out of ICS text embedded in invite emails. */
export function parseIcsAttendees(ics: string): ZohoEventAttendee[] {
  const out: ZohoEventAttendee[] = [];
  const lines = unfoldIcs(ics).split('\n');
  for (const line of lines) {
    if (!/^ATTENDEE/i.test(line) && !/^ORGANIZER/i.test(line)) continue;
    const isOrganizer = /^ORGANIZER/i.test(line);
    const mailto =
      line.match(/mailto:([^;\s>]+)/i)?.[1]?.trim().toLowerCase() ??
      line.match(/:([^\s;]+@[^\s;]+)\s*$/i)?.[1]?.trim().toLowerCase();
    if (!mailto || !mailto.includes('@')) continue;
    const cnRaw = line.match(/(?:^|[;])CN=([^;:]+)/i)?.[1]?.trim();
    const cn = cnRaw ? decodeIcsText(cnRaw) : '';
    const partstat = line.match(/PARTSTAT=([^;:]+)/i)?.[1]?.trim() ?? '';
    out.push({
      email: mailto.replace(/^<|>$/g, ''),
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
  const unfolded = unfoldIcs(ics);
  const m = unfolded.match(/^UID:(.+)$/im);
  return m?.[1]?.trim() ?? null;
}

function summaryFromIcs(ics: string): string | null {
  const unfolded = unfoldIcs(ics);
  const m = unfolded.match(/^SUMMARY:(.+)$/im);
  return m?.[1] ? decodeIcsText(m[1]) : null;
}

function normalizeUid(uid: string): string {
  return uid.trim().toLowerCase().replace(/^<|>$/g, '');
}

/** Soft UID keys so Zoho calendar UIDs match invitation UIDs with minor drift. */
function uidKeys(uid: string): string[] {
  const base = normalizeUid(uid);
  if (!base) return [];
  const keys = new Set<string>([base]);
  const noAt = base.split('@')[0] ?? base;
  if (noAt) keys.add(noAt);
  const bare = base.replace(/[^a-z0-9]/gi, '');
  if (bare.length >= 12) keys.add(bare);
  return [...keys];
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
    // Skip display-name noise left behind by bad splits.
    if (/[&<>"]/.test(email) || email.includes('quot')) continue;
    out.push({ email: email.toLowerCase(), name: nameFromEmail(email), status: 'pending' });
  }
  return out;
}

/**
 * Zoho / Google invite HTML often lists guests under a Guests / Participants
 * heading when ATTENDEE lines aren't available in the body.
 */
function parseHtmlGuestList(html: string): ZohoEventAttendee[] {
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h\d|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .trim();

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const out: ZohoEventAttendee[] = [];
  let inGuests = false;
  for (const line of lines) {
    if (/^(guests?|participants?|attendees?|invitees?)\b[:\s]*$/i.test(line)) {
      inGuests = true;
      continue;
    }
    if (inGuests && /^(when|where|description|notes?|agenda|join|location|organizer|from)\b/i.test(line)) {
      inGuests = false;
      continue;
    }
    if (!inGuests && !/^(guests?|participants?|attendees?)\b/i.test(line)) continue;

    const emails = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
    for (const email of emails) {
      out.push({
        email: email.toLowerCase(),
        name: nameFromEmail(email),
        status: 'pending',
      });
    }
    if (emails.length && !/^(guests?|participants?|attendees?)\b/i.test(line)) {
      // Stay in guest mode for successive lines; stop after a long gap of non-email lines.
    }
  }

  // Also grab mailto: links anywhere (covers company invites that render guests as links).
  const mailtos = html.match(/mailto:([^"'?\s>]+)/gi) ?? [];
  for (const m of mailtos) {
    const email = m.replace(/^mailto:/i, '').trim().toLowerCase();
    if (email.includes('@')) {
      out.push({ email, name: nameFromEmail(email), status: 'pending' });
    }
  }

  return mergeAttendees(out);
}

type InviteAttendeeMap = Map<string, ZohoEventAttendee[]>;

function putAttendees(map: InviteAttendeeMap, key: string | null | undefined, attendees: ZohoEventAttendee[]) {
  if (!key || !attendees.length) return;
  const normalized = normalizeUid(key);
  map.set(normalized, mergeAttendees(map.get(normalized) ?? [], attendees));
  for (const soft of uidKeys(key)) {
    map.set(soft, mergeAttendees(map.get(soft) ?? [], attendees));
  }
}

async function searchInviteMessages(input: {
  accessToken: string;
  accountId: string;
  limit?: number;
}): Promise<InboxMessage[]> {
  const cfg = zohoConfig();
  // Cross-folder search catches Sent (self-organized) and Inbox (colleague-organized).
  const searches = ['subject:Invitation', 'subject:invited', 'subject:"Updated Invitation"'];
  const byId = new Map<string, InboxMessage>();

  await Promise.all(
    searches.map(async (searchKey) => {
      try {
        const params = new URLSearchParams({
          searchKey,
          limit: String(Math.min(Math.max(input.limit ?? 40, 1), 80)),
          includeto: 'true',
        });
        const res = await fetch(
          `${cfg.apiDomain}/api/accounts/${input.accountId}/messages/search?${params.toString()}`,
          { headers: authHeaders(input.accessToken) },
        );
        if (!res.ok) return;
        const json = (await res.json()) as { data?: Record<string, unknown>[] };
        for (const r of json.data ?? []) {
          const messageId = String(r.messageId ?? '');
          if (!messageId || byId.has(messageId)) continue;
          const status = String(r.status ?? r.status2 ?? '');
          byId.set(messageId, {
            messageId,
            folderId: String(r.folderId ?? ''),
            fromAddress: cleanStr(r.fromAddress),
            sender: cleanStr(r.sender ?? r.fromAddress),
            toAddress: cleanStr(r.toAddress ?? r.to ?? ''),
            ccAddress: cleanStr(r.ccAddress ?? r.cc ?? ''),
            subject: String(r.subject ?? '(no subject)'),
            summary: String(r.summary ?? ''),
            receivedTime: Number(r.receivedTime ?? r.receivedtime ?? r.sentDateInGMT ?? 0),
            isUnread: status === '1' || status.toLowerCase() === 'unread',
            hasAttachment: Boolean(Number(r.hasAttachment ?? 0)),
          });
        }
      } catch {
        /* ignore one search */
      }
    }),
  );

  return [...byId.values()].sort((a, b) => b.receivedTime - a.receivedTime);
}

async function icsFromAttachments(input: {
  accessToken: string;
  accountId: string;
  folderId: string;
  messageId: string;
}): Promise<string[]> {
  try {
    const attachments = await getMessageAttachments({
      accessToken: input.accessToken,
      accountId: input.accountId,
      folderId: input.folderId,
      messageId: input.messageId,
      // Zoho→Zoho invites usually put the ICS in an inline calendar part.
      includeInline: true,
    });
    const icsLike = attachments.filter((a) =>
      /\.(ics|ical|ifb)$/i.test(a.attachmentName) || /calendar/i.test(a.attachmentName),
    );
    // Zoho internal invites often attach as invite.ics / event.ics without
    // an obvious name — also try the first few small attachments.
    const candidates =
      icsLike.length > 0
        ? icsLike
        : attachments.filter((a) => a.attachmentSize > 0 && a.attachmentSize < 250_000).slice(0, 3);

    const blocks: string[] = [];
    await Promise.all(
      candidates.map(async (att) => {
        try {
          const { bytes, contentType } = await downloadMessageAttachment({
            accessToken: input.accessToken,
            accountId: input.accountId,
            folderId: input.folderId,
            messageId: input.messageId,
            attachmentId: att.attachmentId,
          });
          const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
          if (/BEGIN:VCALENDAR/i.test(text) || /text\/calendar/i.test(contentType)) {
            blocks.push(...(extractIcsBlocks(text).length ? extractIcsBlocks(text) : [text]));
          }
        } catch {
          /* skip attachment */
        }
      }),
    );
    return blocks;
  } catch {
    return [];
  }
}

/**
 * When Zoho's calendar API hides other guests (common for participant-role
 * events — especially when a teammate organized the meeting), calendar invite
 * emails often still contain the full guest list in embedded ICS, attachments,
 * To/Cc headers (Sent), or HTML guest sections.
 */
export async function buildInviteAttendeeMap(input: {
  accessToken: string;
  accountId: string;
  maxMessages?: number;
}): Promise<InviteAttendeeMap> {
  const map: InviteAttendeeMap = new Map();

  const [searched, inbox] = await Promise.all([
    searchInviteMessages({
      accessToken: input.accessToken,
      accountId: input.accountId,
      limit: input.maxMessages ?? 40,
    }),
    listInboxMessages({
      accessToken: input.accessToken,
      accountId: input.accountId,
      limit: input.maxMessages ?? 80,
    }).catch(() => [] as InboxMessage[]),
  ]);

  const byId = new Map<string, InboxMessage>();
  for (const m of [...searched, ...inbox]) {
    if (!byId.has(m.messageId)) byId.set(m.messageId, m);
  }

  const candidates = [...byId.values()]
    .filter((m) => INVITE_SUBJECT.test(m.subject) || m.hasAttachment)
    .sort((a, b) => {
      // Prefer subject-matched invites, then ones with attachments (ICS).
      const as = INVITE_SUBJECT.test(a.subject) ? 0 : 1;
      const bs = INVITE_SUBJECT.test(b.subject) ? 0 : 1;
      if (as !== bs) return as - bs;
      if (Number(b.hasAttachment) !== Number(a.hasAttachment)) {
        return Number(b.hasAttachment) - Number(a.hasAttachment);
      }
      return b.receivedTime - a.receivedTime;
    })
    .slice(0, 30);

  await Promise.all(
    candidates.map(async (msg) => {
      try {
        const [html, attachmentBlocks] = await Promise.all([
          getMessageContent({
            accessToken: input.accessToken,
            accountId: input.accountId,
            folderId: msg.folderId,
            messageId: msg.messageId,
          }),
          msg.hasAttachment || INVITE_SUBJECT.test(msg.subject)
            ? icsFromAttachments({
                accessToken: input.accessToken,
                accountId: input.accountId,
                folderId: msg.folderId,
                messageId: msg.messageId,
              })
            : Promise.resolve([] as string[]),
        ]);

        const headerAttendees = mergeAttendees(
          parseHeaderRecipients(msg.toAddress),
          parseHeaderRecipients(msg.ccAddress),
          // Organizer is usually the From address on received invites.
          parseHeaderRecipients(msg.fromAddress),
        );
        const htmlGuests = parseHtmlGuestList(html);
        const blocks = [...extractIcsBlocks(html), ...attachmentBlocks];

        if (!blocks.length) {
          const attendees = mergeAttendees(headerAttendees, htmlGuests);
          if (attendees.length) {
            putAttendees(map, msg.subject.toLowerCase(), attendees);
          }
          return;
        }

        for (const block of blocks) {
          const uid = uidFromIcs(block);
          const summary = summaryFromIcs(block);
          const attendees = mergeAttendees(parseIcsAttendees(block), headerAttendees, htmlGuests);
          if (!attendees.length) continue;
          putAttendees(map, uid, attendees);
          if (summary) putAttendees(map, summary.toLowerCase(), attendees);
          putAttendees(map, msg.subject.toLowerCase(), attendees);
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
  for (const key of uidKeys(event.id)) {
    const direct = inviteMap.get(key);
    if (direct?.length) return direct;
  }

  const titleKey = event.title.trim().toLowerCase();
  if (titleKey) {
    const exact = inviteMap.get(titleKey);
    if (exact?.length) return exact;

    let best: ZohoEventAttendee[] = [];
    for (const [key, attendees] of inviteMap) {
      if (!key.includes(titleKey) && !titleKey.includes(key)) continue;
      if (attendees.length > best.length) best = attendees;
    }
    if (best.length) return best;
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
  // Internal organizers often only return organizer + self from Zoho detail —
  // treat anything under 4 guests as possibly incomplete.
  const sparse = input.events.filter((e) => e.attendees.length < 4);
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
