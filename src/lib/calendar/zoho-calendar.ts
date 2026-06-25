import 'server-only';

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

export type ZohoCalendarEvent = {
  id: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
  location: string | null;
  conferenceUrl: string | null;
  attendeeCount: number;
};

/** Returns the user's calendars (default first). */
export async function listCalendars(accessToken: string): Promise<ZohoCalendarInfo[]> {
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
  return mapped.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

/** Zoho expects range timestamps in basic ISO 8601 UTC: yyyyMMddTHHmmssZ. */
function toZohoStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function parseZohoDate(value: unknown): { iso: string; allDay: boolean } | null {
  if (!value) return null;
  const raw = String(value);
  // All-day basic date: yyyyMMdd
  const dateOnly = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    return { iso: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00Z`, allDay: true };
  }
  // Basic datetime: yyyyMMddTHHmmssZ (optionally with offset)
  const dt = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (dt) {
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
    /https:\/\/(meetings\.dialpad\.com|meet\.google\.com|teams\.microsoft\.com|[\w.-]*zoom\.us)[^\s"'<>]+/i,
  );
  return m ? m[0] : null;
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
    const dateandtime = (ev.dateandtime ?? {}) as Record<string, unknown>;
    const start = parseZohoDate(dateandtime.start ?? ev.start);
    const end = parseZohoDate(dateandtime.end ?? ev.end);
    if (!start) continue;
    const blob = `${String(ev.location ?? '')} ${String(ev.description ?? '')}`;
    const attendees = Array.isArray(ev.attendees) ? ev.attendees : [];
    events.push({
      id: String(ev.uid ?? ev.eventid ?? ev.id ?? Math.random().toString(36).slice(2)),
      title: String(ev.title ?? ev.summary ?? '(no title)').trim(),
      start: start.iso,
      end: end?.iso ?? start.iso,
      allDay: start.allDay,
      location: ev.location ? String(ev.location) : null,
      conferenceUrl: extractConferenceUrl(blob),
      attendeeCount: attendees.length,
    });
  }
  return events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}
