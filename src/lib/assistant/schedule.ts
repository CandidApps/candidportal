import { callHankAPI } from '@/lib/candid-data';
import type { FreeBusyInterval } from '@/lib/assistant/types';

export type ScheduleAttendee = { name: string; email: string };

export type ParsedScheduleRequest = {
  title: string;
  attendees: ScheduleAttendee[];
  durationMinutes: number;
  /** Search window (local ISO) within which to find a slot. */
  windowStartISO: string;
  windowEndISO: string;
  /** Whether to attach the user's saved meeting bridge (link/description). */
  includeBridge: boolean;
  note?: string;
};

export type RosterEntry = { name: string; email: string };

function stripFences(s: string): string {
  return s
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/**
 * Uses Hank to turn a plain-language scheduling request into a structured plan.
 * The roster lets the model resolve first names ("josh", "me") to real emails.
 */
export async function parseScheduleRequest(input: {
  text: string;
  roster: RosterEntry[];
  selfName: string;
  selfEmail: string;
  defaultDurationMinutes?: number;
}): Promise<ParsedScheduleRequest> {
  const now = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Denver';
  const rosterLines = input.roster
    .map((r) => `- ${r.name} <${r.email}>`)
    .join('\n');

  const systemPrompt = [
    'You convert a natural-language meeting request into STRICT JSON for a calendar scheduler.',
    `Current date/time: ${now.toString()} (timezone ${tz}).`,
    `The requester is ${input.selfName} <${input.selfEmail}>. "me"/"I"/"my" refers to them.`,
    'Known teammates (resolve first names to these emails when possible):',
    rosterLines || '(none)',
    '',
    'Return ONLY a JSON object, no prose, with this exact shape:',
    '{',
    '  "title": string,                  // concise meeting title',
    '  "attendeeEmails": string[],       // emails of everyone to invite (exclude the requester)',
    '  "durationMinutes": number,        // default 30 if unspecified',
    '  "windowStartISO": string,         // earliest local ISO datetime to consider',
    '  "windowEndISO": string,           // latest local ISO datetime to consider',
    '  "includeBridge": boolean,         // true if they mention their bridge/conference/meeting room/video',
    '  "note": string                    // optional extra context, else ""',
    '}',
    'Interpret relative dates ("friday morning", "next week") against the current date.',
    'Morning = 08:00–12:00, afternoon = 12:00–17:00, evening = 17:00–20:00 local, unless stated.',
    'If only a day is given, use 08:00–18:00 local for that day.',
  ].join('\n');

  const reply = await callHankAPI([{ role: 'user', content: input.text }], { systemPrompt });

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripFences(reply)) as Record<string, unknown>;
  } catch {
    const match = reply.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Could not understand that request. Try rephrasing.');
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  }

  const byEmail = new Map(input.roster.map((r) => [r.email.toLowerCase(), r.name]));
  const rawEmails = Array.isArray(parsed.attendeeEmails) ? parsed.attendeeEmails : [];
  const attendees: ScheduleAttendee[] = [];
  for (const e of rawEmails) {
    const email = String(e).trim().toLowerCase();
    if (!isEmail(email) || email === input.selfEmail.toLowerCase()) continue;
    if (attendees.some((a) => a.email === email)) continue;
    attendees.push({ email, name: byEmail.get(email) ?? email });
  }

  const duration = Number(parsed.durationMinutes);
  const windowStart = String(parsed.windowStartISO ?? '');
  const windowEnd = String(parsed.windowEndISO ?? '');
  if (!windowStart || !windowEnd || Number.isNaN(new Date(windowStart).getTime())) {
    throw new Error('Could not work out a time window from that request. Try being more specific.');
  }

  return {
    title: String(parsed.title ?? 'Meeting').trim() || 'Meeting',
    attendees,
    durationMinutes: Number.isFinite(duration) && duration > 0 ? duration : input.defaultDurationMinutes ?? 30,
    windowStartISO: windowStart,
    windowEndISO: windowEnd,
    includeBridge: Boolean(parsed.includeBridge),
    note: String(parsed.note ?? '') || undefined,
  };
}

export type ProposedSlot = { startISO: string; endISO: string };

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Finds the earliest slot of `durationMinutes` within [windowStart, windowEnd]
 * (clamped to working hours each day) that doesn't overlap any busy interval.
 * Returns null when no common opening exists.
 */
export function findCommonSlot(input: {
  windowStartISO: string;
  windowEndISO: string;
  durationMinutes: number;
  busy: FreeBusyInterval[];
  workDayStartHour?: number;
  workDayEndHour?: number;
  stepMinutes?: number;
}): ProposedSlot | null {
  const windowStart = new Date(input.windowStartISO);
  const windowEnd = new Date(input.windowEndISO);
  const durMs = input.durationMinutes * 60_000;
  const step = (input.stepMinutes ?? 15) * 60_000;
  const dayStartHour = input.workDayStartHour ?? 8;
  const dayEndHour = input.workDayEndHour ?? 18;

  const busy = input.busy
    .map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end))
    .sort((a, b) => a.start - b.start);

  const now = Date.now();
  // Never propose a slot in the past.
  let cursor = Math.max(windowStart.getTime(), now);
  // Round up to the next step boundary.
  cursor = Math.ceil(cursor / step) * step;

  const limit = windowEnd.getTime();
  let guard = 0;
  while (cursor + durMs <= limit && guard < 5000) {
    guard += 1;
    const slotStart = new Date(cursor);
    const hour = slotStart.getHours() + slotStart.getMinutes() / 60;
    const slotEndHour = hour + input.durationMinutes / 60;

    // Keep within working hours; jump to next day's start if outside.
    if (hour < dayStartHour) {
      slotStart.setHours(dayStartHour, 0, 0, 0);
      cursor = slotStart.getTime();
      continue;
    }
    if (slotEndHour > dayEndHour) {
      const next = new Date(slotStart);
      next.setDate(next.getDate() + 1);
      next.setHours(dayStartHour, 0, 0, 0);
      cursor = next.getTime();
      continue;
    }

    const slotEnd = cursor + durMs;
    const clash = busy.some((b) => overlaps(cursor, slotEnd, b.start, b.end));
    if (!clash) {
      return { startISO: new Date(cursor).toISOString(), endISO: new Date(slotEnd).toISOString() };
    }
    cursor += step;
  }
  return null;
}
