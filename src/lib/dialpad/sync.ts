import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  isDialpadConfigured,
  listCompanyUsers,
  listRecentCalls,
  type NormalizedDialpadCall,
} from '@/lib/dialpad/client';
import type { AssistantCall } from '@/lib/assistant/types';

/** Best-effort map of contact email → CRM customer id for the given calls. */
async function matchCustomers(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  calls: NormalizedDialpadCall[],
): Promise<Map<string, string>> {
  const emails = [
    ...new Set(
      calls
        .map((c) => c.contactEmail?.trim().toLowerCase())
        .filter((e): e is string => Boolean(e)),
    ),
  ];
  const map = new Map<string, string>();
  if (emails.length === 0) return map;
  const { data } = await admin
    .from('customer_contacts')
    .select('email, customer_id')
    .in('email', emails);
  for (const row of data ?? []) {
    const email = String(row.email ?? '').toLowerCase();
    if (email && row.customer_id) map.set(email, String(row.customer_id));
  }
  return map;
}

export type DialpadSyncResult = {
  synced: number;
  configured: boolean;
  fetched?: number;
  error?: string;
};

/**
 * Pulls recent calls from Dialpad and upserts them into `dialpad_calls`.
 * Tries a company-wide list first, then falls back to per-user listing
 * (Dialpad's call-list endpoint is target-scoped on many account types).
 * Safe to call on every overview load; captures the first error for surfacing.
 */
export async function syncDialpadCalls(days = 14): Promise<DialpadSyncResult> {
  if (!isDialpadConfigured()) return { synced: 0, configured: false };
  const startedAfterMs = Date.now() - days * 86_400_000;

  const byId = new Map<string, NormalizedDialpadCall>();
  let firstError: string | undefined;

  // 1) Try the company-wide listing.
  try {
    const wide = await listRecentCalls({ startedAfterMs, maxItems: 300, pageLimit: 50 });
    for (const c of wide) byId.set(c.id, c);
  } catch (e) {
    firstError = e instanceof Error ? e.message : 'company-wide list failed';
  }

  // 2) Fall back to per-user listing when company-wide returns nothing.
  if (byId.size === 0) {
    try {
      const users = await listCompanyUsers(200);
      for (const u of users) {
        try {
          const calls = await listRecentCalls({
            startedAfterMs,
            maxItems: 100,
            pageLimit: 50,
            targetId: u.id,
            targetType: 'user',
          });
          for (const c of calls) byId.set(c.id, c);
        } catch (e) {
          if (!firstError) firstError = e instanceof Error ? e.message : 'per-user list failed';
        }
      }
    } catch (e) {
      if (!firstError) firstError = e instanceof Error ? e.message : 'users list failed';
    }
  }

  const calls = [...byId.values()];
  if (calls.length === 0) return { synced: 0, configured: true, fetched: 0, error: firstError };

  const admin = createSupabaseAdminClient();
  const customerByEmail = await matchCustomers(admin, calls);

  const rows = calls.map((c) => ({
    id: c.id,
    direction: c.direction,
    state: c.state,
    contact_name: c.contactName,
    contact_email: c.contactEmail,
    contact_phone: c.contactPhone,
    external_number: c.externalNumber,
    agent_name: c.agentName,
    agent_email: c.agentEmail,
    started_at: c.startedAt,
    ended_at: c.endedAt,
    duration_seconds: c.durationSeconds,
    was_recorded: c.wasRecorded,
    recording_url: c.recordingUrl,
    transcript_text: c.transcriptText,
    recap_summary: c.recapSummary,
    crm_customer_id: c.contactEmail
      ? (customerByEmail.get(c.contactEmail.toLowerCase()) ?? null)
      : null,
    raw: c.raw as unknown as Record<string, unknown>,
  }));

  const { error } = await admin.from('dialpad_calls').upsert(rows, { onConflict: 'id' });
  if (error) return { synced: 0, configured: true, fetched: rows.length, error: error.message };
  return { synced: rows.length, configured: true, fetched: rows.length, error: firstError };
}

/** Reads recent calls from the durable log for MyAssistant. */
export async function loadDialpadCalls(limit = 25): Promise<{ calls: AssistantCall[]; connected: boolean }> {
  const configured = isDialpadConfigured();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('dialpad_calls')
    .select(
      'id, direction, state, contact_name, contact_email, contact_phone, agent_name, started_at, duration_seconds, was_recorded, recording_url, transcript_text, recap_summary, crm_customer_id',
    )
    .order('started_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error || !data) return { calls: [], connected: configured };

  const calls: AssistantCall[] = data.map((r) => ({
    id: String(r.id),
    direction: (r.direction as AssistantCall['direction']) ?? 'unknown',
    state: (r.state as string | null) ?? null,
    contactName: (r.contact_name as string | null) ?? null,
    contactEmail: (r.contact_email as string | null) ?? null,
    contactPhone: (r.contact_phone as string | null) ?? null,
    agentName: (r.agent_name as string | null) ?? null,
    startedAt: (r.started_at as string | null) ?? null,
    durationSeconds: r.duration_seconds != null ? Number(r.duration_seconds) : null,
    wasRecorded: Boolean(r.was_recorded),
    recordingUrl: (r.recording_url as string | null) ?? null,
    transcriptText: (r.transcript_text as string | null) ?? null,
    recapSummary: (r.recap_summary as string | null) ?? null,
    customerId: (r.crm_customer_id as string | null) ?? null,
  }));
  return { calls, connected: configured };
}
