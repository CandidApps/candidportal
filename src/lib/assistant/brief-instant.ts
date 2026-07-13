import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  buildInstantBrief,
  type BriefDeterministicInput,
  type BriefSlaState,
} from '@/lib/assistant/brief-deterministic';
import {
  loadActions,
  loadCalendar,
  loadClaimedActionKeys,
  loadEmailAndRecaps,
  loadMentions,
} from '@/lib/assistant/data';
import { loadDialpadCalls, dialpadUserIdForEmail } from '@/lib/dialpad/sync';
import {
  filterMissedCallsByDismissals,
  type AssistantDismissal,
} from '@/lib/assistant/dismissals';
import type { AssistantBriefResult, AssistantCall } from '@/lib/assistant/types';

function isMissedCall(c: AssistantCall): boolean {
  if (c.direction === 'outbound') return false;
  const s = (c.state ?? '').toLowerCase();
  if (/(missed|voicemail|no.?answer|abandon|reject|declin|unanswered)/.test(s)) return true;
  if (c.direction === 'inbound' && (c.durationSeconds ?? 0) === 0 && !/connect|complet|answer/.test(s)) {
    return true;
  }
  return false;
}

export async function loadAssistantDismissals(userId: string): Promise<AssistantDismissal[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('assistant_dismissals')
    .select('id, ref_type, ref_id, title, created_at')
    .eq('owner_id', userId)
    .limit(500);
  if (error || !data) return [];
  return data.map((row) => ({
    id: String(row.id),
    refType: row.ref_type as AssistantDismissal['refType'],
    refId: String(row.ref_id),
    title: (row.title as string | null) ?? null,
    createdAt: String(row.created_at),
  }));
}

/** Build a brief from live data only — no AI (instant first paint). */
export async function loadInstantBrief(
  userId: string,
  email: string | null,
): Promise<AssistantBriefResult> {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const calendar = await loadCalendar(userId);
  const dialpadUserId = await dialpadUserIdForEmail(email).catch(() => null);

  const [emailResult, actions, mentions, claimedKeys, tasksRes, callsResult, dismissals] =
    await Promise.all([
      loadEmailAndRecaps(userId, calendar.events),
      loadActions(),
      loadMentions(userId),
      loadClaimedActionKeys(),
      admin
        .from('assistant_tasks')
        .select('id, title, priority, status, due_date, due_at, created_at, owner_id, created_by')
        .or(`owner_id.eq.${userId},created_by.eq.${userId}`)
        .neq('status', 'done')
        .limit(40),
      loadDialpadCalls(40, { userId, email, dialpadUserId }, { teamWide: false }),
      loadAssistantDismissals(userId),
    ]);

  const hoursSince = (iso: string): number => {
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? 0 : (now.getTime() - t) / 3_600_000;
  };

  const slaFor = (a: (typeof actions)[number]): BriefSlaState => {
    if (!a.ticketKind) return null;
    if (claimedKeys.has(`${a.ticketKind}:${a.sourceId}`)) return null;
    const hrs = hoursSince(a.createdAt);
    if (hrs >= 48) return 'breached';
    if (hrs >= 24) return 'approaching';
    return null;
  };

  const callLabel = (c: AssistantCall): string =>
    c.contactName || c.contactPhone || c.contactEmail || 'Unknown caller';

  const missedCalls = filterMissedCallsByDismissals(
    callsResult.calls.filter(isMissedCall),
    dismissals,
  );

  const input: BriefDeterministicInput = {
    now,
    actions,
    inbox: emailResult.email.inbox,
    mentions,
    missedCalls,
    events: calendar.events,
    tasks: (tasksRes.data ?? []).map((t) => ({
      title: String(t.title),
      priority: String(t.priority),
      due_at: (t.due_at as string | null) ?? null,
      due_date: t.due_date ? String(t.due_date) : null,
      created_at: t.created_at ? String(t.created_at) : null,
    })),
    slaFor,
    callLabel,
  };

  return buildInstantBrief(input);
}
