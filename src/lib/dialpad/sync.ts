import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  isDialpadConfigured,
  listCompanyUsers,
  listRecentCalls,
  type DialpadUser,
  type NormalizedDialpadCall,
} from '@/lib/dialpad/client';
import { buildCrmContactMaps, matchCustomerId } from '@/lib/dialpad/match';
import type { AssistantCall } from '@/lib/assistant/types';

type EnrichedCall = NormalizedDialpadCall & {
  dialpadUserId: string | null;
};

function enrichFromDialpadUser(call: NormalizedDialpadCall, user?: DialpadUser | null): EnrichedCall {
  return {
    ...call,
    agentName: call.agentName ?? user?.name ?? null,
    agentEmail: call.agentEmail ?? user?.email ?? null,
    dialpadUserId: user?.id ?? null,
  };
}

function resolveDialpadUserForCall(
  call: NormalizedDialpadCall,
  userById: Map<string, DialpadUser>,
  userByEmail: Map<string, DialpadUser>,
): DialpadUser | null {
  const targetId = call.raw.target?.id;
  if (targetId != null) {
    const hit = userById.get(String(targetId));
    if (hit) return hit;
  }
  const agentEmail = call.agentEmail?.trim().toLowerCase();
  if (agentEmail) {
    const hit = userByEmail.get(agentEmail);
    if (hit) return hit;
  }
  return null;
}

async function loadCrmMaps(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const { data } = await admin
    .from('customer_contacts')
    .select('customer_id, email, phone, is_primary')
    .or('email.neq.,phone.neq.');
  return buildCrmContactMaps(data ?? []);
}

async function loadProfileByEmail(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const map = new Map<string, string>();
  const { data } = await admin.from('profiles').select('id, email').not('email', 'is', null);
  for (const row of data ?? []) {
    const email = String(row.email ?? '').trim().toLowerCase();
    if (email && row.id) map.set(email, String(row.id));
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
 * Always syncs per Dialpad user (reliable target-scoped listing), merges any
 * company-wide results, enriches agents from Dialpad user emails → portal
 * profiles, and matches CRM contacts by email or phone.
 */
export async function syncDialpadCalls(days = 14): Promise<DialpadSyncResult> {
  if (!isDialpadConfigured()) return { synced: 0, configured: false };
  const startedAfterMs = Date.now() - days * 86_400_000;

  const byId = new Map<string, EnrichedCall>();
  let firstError: string | undefined;

  let dialpadUsers: DialpadUser[] = [];
  try {
    dialpadUsers = await listCompanyUsers(200);
  } catch (e) {
    firstError = e instanceof Error ? e.message : 'users list failed';
  }

  const userById = new Map(dialpadUsers.map((u) => [u.id, u]));
  const userByEmail = new Map(
    dialpadUsers
      .filter((u) => u.email)
      .map((u) => [u.email!.trim().toLowerCase(), u] as const),
  );

  const merge = (call: NormalizedDialpadCall, owner?: DialpadUser | null) => {
    const user = owner ?? resolveDialpadUserForCall(call, userById, userByEmail);
    const enriched = enrichFromDialpadUser(call, user);
    const existing = byId.get(enriched.id);
    if (!existing) {
      byId.set(enriched.id, enriched);
      return;
    }
    byId.set(enriched.id, {
      ...existing,
      ...enriched,
      agentName: enriched.agentName ?? existing.agentName,
      agentEmail: enriched.agentEmail ?? existing.agentEmail,
      dialpadUserId: enriched.dialpadUserId ?? existing.dialpadUserId,
      contactName: enriched.contactName ?? existing.contactName,
      contactEmail: enriched.contactEmail ?? existing.contactEmail,
      contactPhone: enriched.contactPhone ?? existing.contactPhone,
      transcriptText: enriched.transcriptText ?? existing.transcriptText,
      recapSummary: enriched.recapSummary ?? existing.recapSummary,
      recordingUrl: enriched.recordingUrl ?? existing.recordingUrl,
    });
  };

  // Per-user listing is the reliable path for most Dialpad accounts.
  for (const user of dialpadUsers) {
    try {
      const calls = await listRecentCalls({
        startedAfterMs,
        maxItems: 100,
        pageLimit: 50,
        targetId: user.id,
        targetType: 'user',
      });
      for (const c of calls) merge(c, user);
    } catch (e) {
      if (!firstError) firstError = e instanceof Error ? e.message : 'per-user list failed';
    }
  }

  // Supplement with company-wide results when available.
  try {
    const wide = await listRecentCalls({ startedAfterMs, maxItems: 300, pageLimit: 50 });
    for (const c of wide) merge(c);
  } catch (e) {
    if (!firstError && byId.size === 0) {
      firstError = e instanceof Error ? e.message : 'company-wide list failed';
    }
  }

  const calls = [...byId.values()];
  if (calls.length === 0) return { synced: 0, configured: true, fetched: 0, error: firstError };

  const admin = createSupabaseAdminClient();
  const [crmMaps, profileByEmail] = await Promise.all([loadCrmMaps(admin), loadProfileByEmail(admin)]);

  const rows = calls.map((c) => {
    const agentEmail = c.agentEmail?.trim().toLowerCase() ?? null;
    return {
      id: c.id,
      direction: c.direction,
      state: c.state,
      contact_name: c.contactName,
      contact_email: c.contactEmail,
      contact_phone: c.contactPhone,
      external_number: c.externalNumber,
      agent_name: c.agentName,
      agent_email: c.agentEmail,
      dialpad_user_id: c.dialpadUserId,
      agent_profile_id: agentEmail ? (profileByEmail.get(agentEmail) ?? null) : null,
      started_at: c.startedAt,
      ended_at: c.endedAt,
      duration_seconds: c.durationSeconds,
      was_recorded: c.wasRecorded,
      recording_url: c.recordingUrl,
      transcript_text: c.transcriptText,
      recap_summary: c.recapSummary,
      crm_customer_id: matchCustomerId(crmMaps, {
        email: c.contactEmail,
        phone: c.contactPhone,
        externalNumber: c.externalNumber,
      }),
      raw: c.raw as unknown as Record<string, unknown>,
    };
  });

  const { error } = await admin.from('dialpad_calls').upsert(rows, { onConflict: 'id' });
  if (error) return { synced: 0, configured: true, fetched: rows.length, error: error.message };
  return { synced: rows.length, configured: true, fetched: rows.length, error: firstError };
}

export type DialpadCallViewer = {
  userId: string;
  email: string | null;
  dialpadUserId?: string | null;
};

/** Reads recent calls for MyAssistant — defaults to the signed-in user's line. */
export async function loadDialpadCalls(
  limit = 25,
  viewer?: DialpadCallViewer,
  opts?: { teamWide?: boolean },
): Promise<{ calls: AssistantCall[]; connected: boolean }> {
  const configured = isDialpadConfigured();
  const admin = createSupabaseAdminClient();

  let query = admin
    .from('dialpad_calls')
    .select(
      'id, direction, state, contact_name, contact_email, contact_phone, agent_name, agent_email, started_at, duration_seconds, was_recorded, recording_url, transcript_text, recap_summary, crm_customer_id, dialpad_user_id, agent_profile_id',
    )
    .order('started_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (viewer && !opts?.teamWide) {
    const email = viewer.email?.trim().toLowerCase();
    const parts: string[] = [`agent_profile_id.eq.${viewer.userId}`];
    if (email) parts.push(`agent_email.ilike.${email}`);
    if (viewer.dialpadUserId) parts.push(`dialpad_user_id.eq.${viewer.dialpadUserId}`);
    query = query.or(parts.join(','));
  }

  const { data, error } = await query;
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

/** Resolves the Dialpad user id for a portal email (used when loading "my" calls). */
export async function dialpadUserIdForEmail(email: string | null | undefined): Promise<string | null> {
  if (!email || !isDialpadConfigured()) return null;
  const needle = email.trim().toLowerCase();
  const users = await listCompanyUsers(200);
  return users.find((u) => u.email?.trim().toLowerCase() === needle)?.id ?? null;
}
