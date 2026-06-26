import 'server-only';

/**
 * Thin Dialpad REST client (single company API key).
 *
 * Auth: the API key is sent as a Bearer token in the Authorization header
 * (Dialpad's recommended approach). Configure via env:
 *   DIALPAD_API_KEY    company admin API key (server only)
 *   DIALPAD_API_BASE   optional, defaults to https://dialpad.com
 *
 * Docs: https://developers.dialpad.com/reference/calllist
 */

function apiBase(): string {
  return process.env.DIALPAD_API_BASE?.replace(/\/$/, '') ?? 'https://dialpad.com';
}

export function isDialpadConfigured(): boolean {
  return Boolean(process.env.DIALPAD_API_KEY);
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.DIALPAD_API_KEY ?? ''}`,
    Accept: 'application/json',
  };
}

type DialpadParty = {
  name?: string;
  email?: string;
  phone?: string;
  type?: string;
  id?: string | number;
};

type DialpadRecordingDetail = {
  id?: string;
  url?: string;
  duration?: number;
  recording_type?: string;
};

/** Raw Dialpad call object (subset of fields we use). */
export type DialpadRawCall = {
  call_id?: string | number;
  direction?: string;
  state?: string;
  date_started?: number;
  date_ended?: number;
  date_connected?: number;
  duration?: number;
  total_duration?: number;
  external_number?: string;
  internal_number?: string;
  was_recorded?: boolean;
  transcription_text?: string | null;
  recap_summary?: string | null;
  voicemail_link?: string | null;
  recording_details?: DialpadRecordingDetail[];
  contact?: DialpadParty | null;
  target?: DialpadParty | null;
};

/** Normalized call we persist + surface. */
export type NormalizedDialpadCall = {
  id: string;
  direction: 'inbound' | 'outbound' | 'unknown';
  state: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  externalNumber: string | null;
  agentName: string | null;
  agentEmail: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  wasRecorded: boolean;
  recordingUrl: string | null;
  transcriptText: string | null;
  recapSummary: string | null;
  raw: DialpadRawCall;
};

function isoFromMs(ms: unknown): string | null {
  const n = Number(ms);
  if (!n || Number.isNaN(n)) return null;
  const d = new Date(n);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function pickRecordingUrl(call: DialpadRawCall): string | null {
  const details = Array.isArray(call.recording_details) ? call.recording_details : [];
  const withUrl = details.find((r) => r && r.url);
  if (withUrl?.url) return withUrl.url;
  return call.voicemail_link ?? null;
}

function normalizeDirection(raw: unknown): NormalizedDialpadCall['direction'] {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'inbound') return 'inbound';
  if (s === 'outbound') return 'outbound';
  return 'unknown';
}

export function normalizeCall(call: DialpadRawCall): NormalizedDialpadCall | null {
  const id = call.call_id != null ? String(call.call_id) : '';
  if (!id) return null;
  const contact = call.contact ?? null;
  const target = call.target ?? null;
  const duration = call.duration ?? call.total_duration ?? null;
  return {
    id,
    direction: normalizeDirection(call.direction),
    state: call.state ? String(call.state) : null,
    contactName: contact?.name?.trim() || null,
    contactEmail: contact?.email?.trim() || null,
    contactPhone: contact?.phone?.trim() || call.external_number?.trim() || null,
    externalNumber: call.external_number?.trim() || null,
    agentName: target?.name?.trim() || null,
    agentEmail: target?.email?.trim() || null,
    startedAt: isoFromMs(call.date_started),
    endedAt: isoFromMs(call.date_ended),
    durationSeconds: duration != null ? Math.round(Number(duration)) : null,
    wasRecorded: Boolean(call.was_recorded) || (call.recording_details?.length ?? 0) > 0,
    recordingUrl: pickRecordingUrl(call),
    transcriptText: call.transcription_text ?? null,
    recapSummary: call.recap_summary ?? null,
    raw: call,
  };
}

/**
 * Lists recent calls (reverse-chronological), paginating via Dialpad's cursor
 * until `maxItems` is reached or there are no more pages.
 *
 * Dialpad's call-list endpoint scopes results to a target (user/office/etc.).
 * When `targetId`/`targetType` are provided they're forwarded; otherwise we
 * attempt a company-wide list (works for some account types).
 */
export async function listRecentCalls(input: {
  startedAfterMs: number;
  maxItems?: number;
  pageLimit?: number;
  targetId?: string;
  targetType?: string;
}): Promise<NormalizedDialpadCall[]> {
  if (!isDialpadConfigured()) return [];
  const maxItems = input.maxItems ?? 100;
  const pageLimit = Math.min(input.pageLimit ?? 50, 50);
  const out: NormalizedDialpadCall[] = [];
  let cursor: string | undefined;
  let guard = 0;

  do {
    const params = new URLSearchParams({
      started_after: String(input.startedAfterMs),
      limit: String(pageLimit),
    });
    if (input.targetId) params.set('target_id', input.targetId);
    if (input.targetType) params.set('target_type', input.targetType);
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`${apiBase()}/api/v2/calls?${params.toString()}`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Dialpad calls fetch failed (${res.status}): ${text}`);
    }
    const json = (await res.json()) as { items?: DialpadRawCall[]; cursor?: string };
    const rows = Array.isArray(json.items) ? json.items : [];
    for (const r of rows) {
      const n = normalizeCall(r);
      if (n) out.push(n);
      if (out.length >= maxItems) break;
    }
    cursor = json.cursor;
    guard += 1;
  } while (cursor && out.length < maxItems && guard < 20);

  return out;
}

export type DialpadUser = { id: string; name: string | null; email: string | null };

/** Lists company users (targets) so we can pull per-user call history. */
export async function listCompanyUsers(maxItems = 200): Promise<DialpadUser[]> {
  if (!isDialpadConfigured()) return [];
  const out: DialpadUser[] = [];
  let cursor: string | undefined;
  let guard = 0;
  do {
    const params = new URLSearchParams({ limit: '100' });
    if (cursor) params.set('cursor', cursor);
    const res = await fetch(`${apiBase()}/api/v2/users?${params.toString()}`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Dialpad users fetch failed (${res.status}): ${text}`);
    }
    const json = (await res.json()) as {
      items?: {
        id?: string | number;
        display_name?: string;
        first_name?: string;
        last_name?: string;
        email?: string;
        emails?: string[];
      }[];
      cursor?: string;
    };
    for (const u of json.items ?? []) {
      if (u.id == null) continue;
      const email =
        (typeof u.email === 'string' && u.email.trim()) ||
        (Array.isArray(u.emails) ? (u.emails[0] ?? null) : null);
      out.push({
        id: String(u.id),
        name:
          u.display_name ??
          ([u.first_name, u.last_name].filter(Boolean).join(' ') || null),
        email,
      });
      if (out.length >= maxItems) break;
    }
    cursor = json.cursor;
    guard += 1;
  } while (cursor && out.length < maxItems && guard < 10);
  return out;
}

/**
 * One-shot diagnostic: hits the calls endpoint (optionally for a target) and
 * reports the raw HTTP status + item count without throwing or writing to the DB.
 */
export async function diagnoseCalls(input: {
  startedAfterMs: number;
  targetId?: string;
  targetType?: string;
}): Promise<{ ok: boolean; status: number; count: number; error?: string; sampleKeys?: string[] }> {
  if (!isDialpadConfigured()) return { ok: false, status: 0, count: 0, error: 'No DIALPAD_API_KEY set' };
  const params = new URLSearchParams({ started_after: String(input.startedAfterMs), limit: '5' });
  if (input.targetId) params.set('target_id', input.targetId);
  if (input.targetType) params.set('target_type', input.targetType);
  try {
    const res = await fetch(`${apiBase()}/api/v2/calls?${params.toString()}`, { headers: authHeaders() });
    const bodyText = await res.text().catch(() => '');
    if (!res.ok) {
      return { ok: false, status: res.status, count: 0, error: bodyText.slice(0, 400) };
    }
    let json: { items?: DialpadRawCall[] } = {};
    try {
      json = JSON.parse(bodyText) as { items?: DialpadRawCall[] };
    } catch {
      /* non-JSON body */
    }
    const items = Array.isArray(json.items) ? json.items : [];
    return {
      ok: true,
      status: res.status,
      count: items.length,
      sampleKeys: items[0] ? Object.keys(items[0]) : [],
    };
  } catch (e) {
    return { ok: false, status: 0, count: 0, error: e instanceof Error ? e.message : 'fetch failed' };
  }
}
