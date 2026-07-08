import 'server-only';

import { cleanDialpadRecapContent } from '@/lib/email/dialpad-recap-link';

/**
 * Thin Zoho Calendar REST client for read-only event listing.
 * Reuses the Zoho OAuth access token obtained for the user's mailbox
 * connection (the calendar scopes must have been granted at consent).
 *
 * Docs: https://www.zoho.com/calendar/help/api/
 */

function calendarApiDomain(): string {
  return process.env.ZOHO_CALENDAR_API_DOMAIN ?? 'https://calendar.zoho.com';
}

/** Avoid hammering GET /calendars — Zoho rate-limits this URL aggressively. */
const calendarsCache = new Map<string, { at: number; data: ZohoCalendarInfo[] }>();
const CALENDARS_CACHE_TTL_MS = 5 * 60 * 1000;

function calendarsCacheKey(accessToken: string): string {
  return accessToken.slice(-32);
}

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Zoho-oauthtoken ${accessToken}`,
    Accept: 'application/json',
  };
}

export type ZohoCalendarInfo = {
  uid: string;
  name: string;
  isDefault: boolean;
};

export type ZohoEventAttendee = {
  name: string;
  email: string;
  status: 'accepted' | 'declined' | 'tentative' | 'pending';
  isOrganizer?: boolean;
};

export type ZohoCalendarEvent = {
  id: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
  location: string | null;
  description: string | null;
  /** Dialpad recap link extracted from the event description, when present. */
  dialpadRecapUrl: string | null;
  conferenceUrl: string | null;
  attendees: ZohoEventAttendee[];
  attendeeCount: number;
  /** True when attendees came from the event-detail API (complete list). */
  attendeesComplete: boolean;
  /** Zoho calendar this event belongs to (needed for detail/group attendee APIs). */
  calendarUid: string;
  etag: string | null;
  organizer: string | null;
  organizerName: string | null;
};

/** Returns the user's calendars (default first). */
export async function listCalendars(
  accessToken: string,
  opts?: { bypassCache?: boolean },
): Promise<ZohoCalendarInfo[]> {
  const cacheKey = calendarsCacheKey(accessToken);
  if (!opts?.bypassCache) {
    const hit = calendarsCache.get(cacheKey);
    if (hit && Date.now() - hit.at < CALENDARS_CACHE_TTL_MS) return hit.data;
  }

  const res = await fetch(`${calendarApiDomain()}/api/v1/calendars`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Zoho calendars fetch failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { calendars?: Record<string, unknown>[] };
  const rows = Array.isArray(json.calendars) ? json.calendars : [];
  const mapped = rows.map((c) => ({
    uid: String(c.uid ?? c.calUID ?? c.id ?? ''),
    name: String(c.name ?? c.calendarName ?? 'Calendar'),
    isDefault: Boolean(c.isdefault ?? c.isDefault ?? c.default ?? false),
  }));
  const sorted = mapped.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  calendarsCache.set(cacheKey, { at: Date.now(), data: sorted });
  return sorted;
}

/** Zoho expects range timestamps in basic ISO 8601 UTC: yyyyMMddTHHmmssZ. */
function toZohoStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/**
 * Offset (ms) of `timeZone` at the given instant, defined as
 * (the wall-clock reading in that zone, interpreted as if it were UTC) − (the real UTC instant).
 */
function tzOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const m: Record<string, number> = {};
  for (const p of parts) if (p.type !== 'literal') m[p.type] = Number(p.value);
  const asUTC = Date.UTC(m.year, (m.month ?? 1) - 1, m.day, m.hour, m.minute, m.second);
  return asUTC - date.getTime();
}

/**
 * Interprets naked wall-clock components (no offset) as a local time in `timeZone`
 * and returns the corresponding UTC ISO instant. Two passes handle DST boundaries.
 */
function wallClockToUtcIso(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  timeZone: string,
): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let offset = tzOffsetMs(timeZone, new Date(guess));
  let actual = guess - offset;
  offset = tzOffsetMs(timeZone, new Date(actual));
  actual = guess - offset;
  return new Date(actual).toISOString();
}

function parseZohoDate(
  value: unknown,
  timeZone?: string | null,
): { iso: string; allDay: boolean } | null {
  if (!value) return null;
  const raw = String(value).trim();
  // All-day basic date: yyyyMMdd
  const dateOnly = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    return { iso: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00Z`, allDay: true };
  }
  // Datetime with an explicit offset or Z — trust the offset.
  const withOffset = raw.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z|[+-]\d{2}:?\d{2})$/,
  );
  if (withOffset) {
    const [, yy, MM, dd, hh, mm, ss, off] = withOffset;
    const norm = off === 'Z' ? 'Z' : off.includes(':') ? off : `${off.slice(0, 3)}:${off.slice(3)}`;
    const parsed = new Date(`${yy}-${MM}-${dd}T${hh}:${mm}:${ss}${norm}`);
    if (!Number.isNaN(parsed.getTime())) return { iso: parsed.toISOString(), allDay: false };
  }
  // Naked basic datetime: yyyyMMddTHHmmss — Zoho returns these in the calendar's
  // own timezone, so convert from that zone to UTC (not blindly tagged as UTC).
  const dt = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (dt) {
    if (timeZone) {
      try {
        return {
          iso: wallClockToUtcIso(+dt[1], +dt[2], +dt[3], +dt[4], +dt[5], +dt[6], timeZone),
          allDay: false,
        };
      } catch {
        /* fall through to UTC assumption */
      }
    }
    return {
      iso: `${dt[1]}-${dt[2]}-${dt[3]}T${dt[4]}:${dt[5]}:${dt[6]}Z`,
      allDay: false,
    };
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return { iso: parsed.toISOString(), allDay: false };
  return null;
}

function extractConferenceUrl(blob: string): string | null {
  const m = blob.match(
    /https:\/\/([\w.-]*dialpad\.com|meet\.google\.com|teams\.microsoft\.com|[\w.-]*zoom\.us|[\w.-]*webex\.com|[\w.-]*gotomeeting\.com)[^\s"'<>]+/i,
  );
  return m ? m[0] : null;
}

/** First http(s) URL found in a string, if any. */
function firstUrl(value: unknown): string | null {
  const m = String(value ?? '').match(/https?:\/\/[^\s"'<>]+/i);
  return m ? m[0] : null;
}

function mapAttendeeStatus(raw: unknown): ZohoEventAttendee['status'] {
  const s = String(raw ?? '').toLowerCase();
  if (s.includes('accept') || s === '1' || s === 'yes') return 'accepted';
  if (s.includes('declin') || s === '3' || s === 'no') return 'declined';
  if (s.includes('tentat') || s === '2' || s === 'maybe') return 'tentative';
  return 'pending';
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

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function attendeeFromRecord(att: Record<string, unknown>): ZohoEventAttendee | null {
  const email = cleanStr(att.email ?? att.attendee ?? att.mail ?? att.eid);
  const zuid = att.id ?? att.zid ?? att.zuid;
  const emailFromId = typeof zuid === 'string' && isEmailLike(zuid) ? zuid : '';
  const resolvedEmail = email || emailFromId;
  const rawName = cleanStr(
    att.dname ?? att.dName ?? att.displayName ?? att.name ?? att.fullName ?? att.cn,
  );
  const name = rawName || (resolvedEmail ? nameFromEmail(resolvedEmail) : '');
  if (!resolvedEmail && !name) return null;
  return {
    name: name || 'Guest',
    email: resolvedEmail,
    status: mapAttendeeStatus(att.status ?? att.partstat ?? att.attendeeStatus ?? att.rsvp),
    isOrganizer: Boolean(att.isorganizer ?? att.isOrganizer ?? att.organizer),
  };
}

function parseAttendees(raw: unknown): ZohoEventAttendee[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    const email = raw.trim();
    if (!isEmailLike(email)) return [];
    return [{ name: nameFromEmail(email), email, status: 'pending' }];
  }
  if (Array.isArray(raw)) {
    const out: ZohoEventAttendee[] = [];
    for (const a of raw) {
      if (typeof a === 'string') {
        out.push(...parseAttendees(a));
        continue;
      }
      const att = (a ?? {}) as Record<string, unknown>;
      const parsed = attendeeFromRecord(att);
      if (parsed) out.push(parsed);
    }
    return out;
  }
  if (typeof raw === 'object') {
    const out: ZohoEventAttendee[] = [];
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        out.push(...parseAttendees(value));
        continue;
      }
      if (value && typeof value === 'object') {
        const parsed = attendeeFromRecord(value as Record<string, unknown>);
        if (parsed) out.push(parsed);
        continue;
      }
      if (typeof value === 'string' && isEmailLike(value)) {
        out.push({ name: nameFromEmail(value), email: value, status: 'pending' });
        continue;
      }
      if (isEmailLike(key)) {
        out.push({ name: nameFromEmail(key), email: key, status: 'pending' });
      }
    }
    return out;
  }
  return [];
}

/** Zoho detail responses nest group invitees under group_attendees.{groupId}[]. */
function parseGroupAttendees(raw: unknown): ZohoEventAttendee[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const out: ZohoEventAttendee[] = [];
  for (const group of Object.values(raw as Record<string, unknown>)) {
    out.push(...parseAttendees(group));
  }
  return out;
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

function collectAttendees(ev: Record<string, unknown>): ZohoEventAttendee[] {
  return mergeAttendees(
    parseAttendees(ev.attendees ?? ev.attendee ?? ev.participants ?? ev.attendees_list ?? ev.attendeeList),
    parseGroupAttendees(ev.group_attendees ?? ev.groupAttendees),
    parseAttendees(ev.group_attendees_list ?? ev.groupAttendeesList),
  );
}

function groupIdsFromEvent(ev: Record<string, unknown>): string[] {
  const fromList = parseGroupList(ev.group_list ?? ev.groupList).map((g) => g.id);
  if (fromList.length) return fromList;

  const ga = ev.group_attendees ?? ev.groupAttendees;
  if (ga && typeof ga === 'object' && !Array.isArray(ga)) {
    return Object.keys(ga as Record<string, unknown>).filter(Boolean);
  }
  return [];
}

/** Zoho's organizer can be an object ({email,dname}) or a bare email string. */
function parseOrganizer(raw: unknown): { name: string; email: string } | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const email = raw.trim();
    if (!email) return null;
    return { name: nameFromEmail(email), email };
  }
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const email = cleanStr(o.email ?? o.mail ?? o.id ?? o.attendee);
    const name = cleanStr(o.dname ?? o.displayName ?? o.name ?? o.cn) || (email ? nameFromEmail(email) : '');
    if (!email && !name) return null;
    return { name: name || (email ? nameFromEmail(email) : 'Organizer'), email };
  }
  return null;
}

/** Maps a single raw Zoho event object into our normalized shape. */
function mapZohoEvent(
  ev: Record<string, unknown>,
  opts?: { attendeesComplete?: boolean; calendarUid?: string },
): ZohoCalendarEvent | null {
  const dateandtime = (ev.dateandtime ?? {}) as Record<string, unknown>;
  const eventTz = dateandtime.timezone ? String(dateandtime.timezone) : null;
  const start = parseZohoDate(dateandtime.start ?? ev.start, eventTz);
  const end = parseZohoDate(dateandtime.end ?? ev.end, eventTz);
  if (!start) return null;
  const descriptionRaw = ev.description ? String(ev.description) : '';
  const cleanedDesc = cleanDialpadRecapContent({ html: descriptionRaw });
  const description = cleanedDesc.text || null;
  // Zoho stores an event's meeting/conference link in a dedicated `url` field
  // (what we write as eventdata.url). Prefer it, then fall back to scanning the
  // location + description for a known conferencing link (Dialpad, Meet, etc.).
  const urlField =
    firstUrl(ev.url) ??
    firstUrl(ev.onlineMeetingUrl) ??
    firstUrl((ev.conference as Record<string, unknown> | undefined)?.url);
  const blob = `${String(ev.url ?? '')} ${String(ev.location ?? '')} ${String(ev.description ?? '')}`;
  const conferenceUrl = urlField ?? extractConferenceUrl(blob);
  const attendees = collectAttendees(ev);
  const organizer = parseOrganizer(ev.organizer ?? ev.createdby ?? ev.owner);

  // Zoho's event-list endpoint frequently returns only the current user (or
  // nobody) in `attendees`, so fold the organizer in as a participant and flag
  // them. This keeps the organizer visible even on meetings you didn't create.
  if (organizer) {
    const match = organizer.email
      ? attendees.find((a) => a.email.toLowerCase() === organizer.email.toLowerCase())
      : attendees.find((a) => a.name.toLowerCase() === organizer.name.toLowerCase());
    if (match) {
      match.isOrganizer = true;
      if (!match.name && organizer.name) match.name = organizer.name;
    } else {
      attendees.unshift({
        name: organizer.name,
        email: organizer.email,
        status: 'accepted',
        isOrganizer: true,
      });
    }
  }

  return {
    id: String(ev.uid ?? ev.eventid ?? ev.id ?? Math.random().toString(36).slice(2)),
    title: String(ev.title ?? ev.summary ?? '(no title)').trim(),
    start: start.iso,
    end: end?.iso ?? start.iso,
    allDay: start.allDay,
    location: ev.location ? String(ev.location) : null,
    description,
    dialpadRecapUrl: cleanedDesc.recapUrl,
    conferenceUrl,
    attendees,
    attendeeCount: attendees.length,
    attendeesComplete: opts?.attendeesComplete ?? false,
    calendarUid: opts?.calendarUid ?? String(ev.caluid ?? ev.calUID ?? ''),
    etag: ev.etag ? String(ev.etag) : null,
    organizer: organizer?.email || null,
    organizerName: organizer?.name || null,
  };
}

/** Lists events in [start, end) for the given calendar. */
export async function listEvents(input: {
  accessToken: string;
  calendarUid: string;
  start: Date;
  end: Date;
}): Promise<ZohoCalendarEvent[]> {
  const range = JSON.stringify({
    start: toZohoStamp(input.start),
    end: toZohoStamp(input.end),
  });
  const params = new URLSearchParams({ range });
  const res = await fetch(
    `${calendarApiDomain()}/api/v1/calendars/${encodeURIComponent(input.calendarUid)}/events?${params.toString()}`,
    { headers: authHeaders(input.accessToken) },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Zoho events fetch failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { events?: Record<string, unknown>[] };
  const rows = Array.isArray(json.events) ? json.events : [];
  const events: ZohoCalendarEvent[] = [];
  for (const ev of rows) {
    const mapped = mapZohoEvent(ev, { calendarUid: input.calendarUid });
    if (mapped) events.push(mapped);
  }
  return events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

/** Lists events across every calendar the user can access (deduped by id+start). */
export async function listEventsAllCalendars(input: {
  accessToken: string;
  start: Date;
  end: Date;
  calendars?: ZohoCalendarInfo[];
}): Promise<ZohoCalendarEvent[]> {
  const calendars = input.calendars ?? (await listCalendars(input.accessToken));
  const seen = new Set<string>();
  const events: ZohoCalendarEvent[] = [];
  for (const cal of calendars) {
    if (!cal.uid) continue;
    const listed = await listEvents({
      accessToken: input.accessToken,
      calendarUid: cal.uid,
      start: input.start,
      end: input.end,
    });
    for (const ev of listed) {
      const key = `${ev.id}|${ev.start}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({ ...ev, calendarUid: ev.calendarUid || cal.uid });
    }
  }
  return events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

function parseGroupList(raw: unknown): { id: string; name: string | null }[] {
  if (!Array.isArray(raw)) return [];
  const out: { id: string; name: string | null }[] = [];
  for (const g of raw) {
    const row = (g ?? {}) as Record<string, unknown>;
    const id = cleanStr(row.id ?? row.groupId ?? row.uid);
    if (!id) continue;
    out.push({ id, name: cleanStr(row.name) || null });
  }
  return out;
}

async function fetchGroupAttendeeStatus(input: {
  accessToken: string;
  calendarUid: string;
  eventUid: string;
  groupId: string;
}): Promise<ZohoEventAttendee[]> {
  const params = new URLSearchParams({ groupId: input.groupId });
  const res = await fetch(
    `${calendarApiDomain()}/api/v1/calendars/${encodeURIComponent(input.calendarUid)}/events/${encodeURIComponent(input.eventUid)}/groupattendeestatus?${params.toString()}`,
    { headers: authHeaders(input.accessToken) },
  );
  if (!res.ok) return [];
  const json = (await res.json()) as {
    GRP_MEM_OBJ?: Record<string, { eid?: string; dname?: string; rsvp?: string }>;
  };
  const out: ZohoEventAttendee[] = [];
  for (const mem of Object.values(json.GRP_MEM_OBJ ?? {})) {
    const email = cleanStr(mem.eid);
    if (!email) continue;
    out.push({
      email,
      name: cleanStr(mem.dname) || nameFromEmail(email),
      status: mapAttendeeStatus(mem.rsvp),
    });
  }
  return out;
}

async function loadExtraAttendees(input: {
  accessToken: string;
  calendarUid: string;
  eventUid: string;
  ev: Record<string, unknown>;
}): Promise<ZohoEventAttendee[]> {
  const groups = groupIdsFromEvent(input.ev);
  if (!groups.length) return [];
  const batches = await Promise.all(
    groups.map((groupId) =>
      fetchGroupAttendeeStatus({
        accessToken: input.accessToken,
        calendarUid: input.calendarUid,
        eventUid: input.eventUid,
        groupId,
      }),
    ),
  );
  return mergeAttendees(...batches);
}

/**
 * Fetches a single event's full detail. The list endpoint often returns a
 * trimmed attendee set (sometimes just the current user), so the detail call is
 * used to show the complete participant list with emails.
 */
export async function getEvent(input: {
  accessToken: string;
  calendarUid: string;
  eventUid: string;
  recurrenceId?: string | null;
}): Promise<ZohoCalendarEvent | null> {
  const params = new URLSearchParams();
  if (input.recurrenceId) params.set('recurrenceid', input.recurrenceId);
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(
    `${calendarApiDomain()}/api/v1/calendars/${encodeURIComponent(input.calendarUid)}/events/${encodeURIComponent(input.eventUid)}${q}`,
    {
      headers: {
        ...authHeaders(input.accessToken),
        Accept: 'application/json+large',
      },
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Zoho event fetch failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as {
    events?: Record<string, unknown>[];
    event?: Record<string, unknown>;
  };
  const ev = json.events?.[0] ?? json.event;
  if (!ev || typeof ev !== 'object') return null;
  const extra = await loadExtraAttendees({
    accessToken: input.accessToken,
    calendarUid: input.calendarUid,
    eventUid: input.eventUid,
    ev,
  });
  const mapped = mapZohoEvent(ev, {
    attendeesComplete: true,
    calendarUid: input.calendarUid,
  });
  if (!mapped) return null;
  if (extra.length) {
    mapped.attendees = mergeAttendees(mapped.attendees, extra);
    mapped.attendeeCount = mapped.attendees.length;
  }
  return mapped;
}

/** Tries the hinted calendar first, then every calendar until the event is found. */
export async function getEventFromAnyCalendar(input: {
  accessToken: string;
  eventUid: string;
  calendarUid?: string;
  recurrenceId?: string | null;
  calendars?: ZohoCalendarInfo[];
}): Promise<ZohoCalendarEvent | null> {
  if (input.calendarUid) {
    try {
      const ev = await getEvent({
        accessToken: input.accessToken,
        calendarUid: input.calendarUid,
        eventUid: input.eventUid,
        recurrenceId: input.recurrenceId,
      });
      if (ev) return ev;
    } catch {
      /* try other calendars */
    }
  }
  const calendars = input.calendars ?? (await listCalendars(input.accessToken));
  for (const cal of calendars) {
    if (!cal.uid || cal.uid === input.calendarUid) continue;
    try {
      const ev = await getEvent({
        accessToken: input.accessToken,
        calendarUid: cal.uid,
        eventUid: input.eventUid,
        recurrenceId: input.recurrenceId,
      });
      if (ev) return ev;
    } catch {
      /* next calendar */
    }
  }
  return null;
}

/**
 * Zoho's event-list API often returns a trimmed attendee set (especially when
 * role=participant). Fetch each event's detail so participants and group
 * invitees are complete before rendering the calendar.
 */
export async function enrichEventsWithFullDetails(input: {
  accessToken: string;
  calendarUid: string;
  events: ZohoCalendarEvent[];
  concurrency?: number;
  accountId?: string | null;
  calendars?: ZohoCalendarInfo[];
  /** Cap detail fetches per request to stay under Zoho rolling limits. */
  maxEnrich?: number;
  /** ICS invite fallback is expensive — skip on bulk list loads. */
  inviteFallback?: boolean;
}): Promise<ZohoCalendarEvent[]> {
  if (!input.events.length) return [];
  const concurrency = Math.max(1, Math.min(input.concurrency ?? 2, 4));
  const maxEnrich = Math.max(0, input.maxEnrich ?? 12);
  const calendars = input.calendars ?? (await listCalendars(input.accessToken));
  const out = [...input.events];
  let enriched = 0;

  for (let i = 0; i < out.length; i += concurrency) {
    const slice = out.slice(i, i + concurrency);
    const detailed = await Promise.all(
      slice.map(async (ev) => {
        if (ev.attendeesComplete && ev.attendees.length > 2) return ev;
        if (enriched >= maxEnrich) return ev;
        enriched += 1;
        try {
          const calUid = ev.calendarUid || input.calendarUid;
          const full = calUid
            ? await getEvent({
                accessToken: input.accessToken,
                calendarUid: calUid,
                eventUid: ev.id,
              })
            : await getEventFromAnyCalendar({
                accessToken: input.accessToken,
                eventUid: ev.id,
                calendars,
              });
          if (!full) return ev;
          return {
            ...ev,
            calendarUid: full.calendarUid || calUid,
            attendees: full.attendees,
            attendeeCount: full.attendees.length,
            attendeesComplete: true,
            description: full.description ?? ev.description,
            dialpadRecapUrl: full.dialpadRecapUrl ?? ev.dialpadRecapUrl,
            location: full.location ?? ev.location,
            conferenceUrl: full.conferenceUrl ?? ev.conferenceUrl,
            organizer: full.organizer ?? ev.organizer,
            organizerName: full.organizerName ?? ev.organizerName,
            etag: full.etag ?? ev.etag,
          };
        } catch {
          return ev;
        }
      }),
    );
    for (let j = 0; j < detailed.length; j++) out[i + j] = detailed[j];
  }

  if (input.inviteFallback && input.accountId) {
    const { enrichEventsFromInviteEmails } = await import('@/lib/calendar/calendar-invite-attendees');
    await enrichEventsFromInviteEmails({
      accessToken: input.accessToken,
      accountId: input.accountId,
      events: out,
    });
  }

  return out;
}

/** Builds the Zoho `dateandtime` block from ISO start/end. */
function buildDateAndTime(input: { start: string; end: string; allDay: boolean }): Record<string, unknown> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Denver';
  if (input.allDay) {
    const d = new Date(input.start);
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    return { start: stamp, end: stamp, timezone: tz };
  }
  const fmt = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
      `T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    );
  };
  return { start: fmt(input.start), end: fmt(input.end), timezone: tz };
}

export type EventWriteInput = {
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  location?: string | null;
  description?: string | null;
  meetingUrl?: string | null;
  attendees?: string[];
};

/** Creates an event on the given calendar. */
export async function createEvent(input: {
  accessToken: string;
  calendarUid: string;
  event: EventWriteInput;
}): Promise<void> {
  const eventdata: Record<string, unknown> = {
    title: input.event.title,
    dateandtime: buildDateAndTime({
      start: input.event.start,
      end: input.event.end,
      allDay: Boolean(input.event.allDay),
    }),
  };
  if (input.event.location) eventdata.location = input.event.location;
  if (input.event.description) eventdata.description = input.event.description;
  if (input.event.meetingUrl) eventdata.url = input.event.meetingUrl;
  if (input.event.attendees?.length) {
    eventdata.attendees = input.event.attendees.map((email) => ({ email }));
  }

  const params = new URLSearchParams({ eventdata: JSON.stringify(eventdata) });
  const res = await fetch(
    `${calendarApiDomain()}/api/v1/calendars/${encodeURIComponent(input.calendarUid)}/events`,
    {
      method: 'POST',
      headers: { ...authHeaders(input.accessToken), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Zoho create event failed (${res.status}): ${text}`);
  }
}

/** Updates an existing event. Requires the event's current etag. */
export async function updateEvent(input: {
  accessToken: string;
  calendarUid: string;
  eventUid: string;
  etag: string | null;
  event: EventWriteInput;
}): Promise<void> {
  const eventdata: Record<string, unknown> = {
    title: input.event.title,
    dateandtime: buildDateAndTime({
      start: input.event.start,
      end: input.event.end,
      allDay: Boolean(input.event.allDay),
    }),
  };
  if (input.event.location !== undefined) eventdata.location = input.event.location ?? '';
  if (input.event.description !== undefined) eventdata.description = input.event.description ?? '';
  if (input.event.meetingUrl !== undefined) eventdata.url = input.event.meetingUrl ?? '';
  if (input.etag) eventdata.etag = input.etag;

  const params = new URLSearchParams({ eventdata: JSON.stringify(eventdata) });
  const headers: Record<string, string> = {
    ...(authHeaders(input.accessToken) as Record<string, string>),
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (input.etag) headers['If-Match'] = input.etag;

  const res = await fetch(
    `${calendarApiDomain()}/api/v1/calendars/${encodeURIComponent(input.calendarUid)}/events/${encodeURIComponent(input.eventUid)}`,
    { method: 'PUT', headers, body: params.toString() },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Zoho update event failed (${res.status}): ${text}`);
  }
}

export type FreeBusySlot = { start: string; end: string };

/**
 * Returns busy intervals (as ISO instants) for a user over [start, end) using
 * Zoho's free/busy API. Requires the ZohoCalendar.freebusy scope. Returns an
 * empty array when the user has no visible busy blocks.
 *
 * Docs: https://www.zoho.com/calendar/help/api/get-user-freebusy-details.html
 */
export async function getUserFreeBusy(input: {
  accessToken: string;
  email: string;
  start: Date;
  end: Date;
}): Promise<FreeBusySlot[]> {
  // Zoho expects sdate/edate as basic ISO without timezone (yyyyMMddTHHmmss).
  const stamp = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
      `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
    );
  };
  const params = new URLSearchParams({
    uemail: input.email,
    sdate: stamp(input.start),
    edate: stamp(input.end),
    ftype: 'eventbased',
  });
  const res = await fetch(`${calendarApiDomain()}/api/v1/calendars/freebusy?${params.toString()}`, {
    headers: authHeaders(input.accessToken),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Zoho free/busy failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { freebusy?: Record<string, unknown>[] };
  const rows = Array.isArray(json.freebusy) ? json.freebusy : [];
  const slots: FreeBusySlot[] = [];
  for (const r of rows) {
    const start = parseZohoDate(r.startTime ?? r.start, null);
    const end = parseZohoDate(r.endTime ?? r.end, null);
    const type = String(r.fbtype ?? r.type ?? 'busy').toLowerCase();
    if (start && end && type !== 'free') {
      slots.push({ start: start.iso, end: end.iso });
    }
  }
  return slots;
}

/** Deletes an event. */
export async function deleteEvent(input: {
  accessToken: string;
  calendarUid: string;
  eventUid: string;
  etag: string | null;
}): Promise<void> {
  const headers: Record<string, string> = { ...(authHeaders(input.accessToken) as Record<string, string>) };
  if (input.etag) headers['If-Match'] = input.etag;
  const res = await fetch(
    `${calendarApiDomain()}/api/v1/calendars/${encodeURIComponent(input.calendarUid)}/events/${encodeURIComponent(input.eventUid)}`,
    { method: 'DELETE', headers },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Zoho delete event failed (${res.status}): ${text}`);
  }
}
