import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { askHankServer } from '@/lib/hank/server';
import { briefCacheIsFresh } from '@/lib/claude-usage';
import {
  loadActions,
  loadCalendar,
  loadClaimedActionKeys,
  loadEmailAndRecaps,
  loadMentions,
} from '@/lib/assistant/data';
import { loadDialpadCalls, dialpadUserIdForEmail } from '@/lib/dialpad/sync';
import {
  buildMissedItems,
  buildTodayPriorities,
  mergePriorities,
} from '@/lib/assistant/brief-deterministic';
import { loadInstantBrief, loadAssistantDismissals } from '@/lib/assistant/brief-instant';
import { filterMissedCallsByDismissals } from '@/lib/assistant/dismissals';
import type {
  AssistantBrief,
  AssistantBriefResult,
  AssistantCall,
  AssistantIntent,
  AssistantPriority,
  AssistantRef,
  TriagedEmail,
} from '@/lib/assistant/types';

export const dynamic = 'force-dynamic';

async function currentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

function extractJson(text: string): unknown {
  let t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) t = fenced[1].trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s !== -1 && e !== -1 && e > s) {
    try {
      return JSON.parse(t.slice(s, e + 1));
    } catch {
      /* ignore */
    }
  }
  return null;
}

const EMPTY_BRIEF: AssistantBrief = {
  weekStatus: '',
  highlights: [],
  priorities: [],
  missed: [],
  recommendation: '',
  generatedAt: null,
};

function fmtClock(ms: number): string {
  const d = new Date(ms);
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

async function generate(
  userId: string,
  displayName: string,
  email: string | null,
  usageTrigger?: 'manual_sync' | 'auto_refresh',
): Promise<AssistantBriefResult> {
  const admin = createSupabaseAdminClient();

  const calendar = await loadCalendar(userId);
  const dialpadUserId = await dialpadUserIdForEmail(email).catch(() => null);
  const [emailResult, actions, mentions, claimedKeys, contextRes, tasksRes, callsResult] = await Promise.all([
    loadEmailAndRecaps(userId, calendar.events),
    loadActions(),
    loadMentions(userId),
    loadClaimedActionKeys(),
    admin
      .from('assistant_context')
      .select('subject, info, scope')
      .or(`owner_id.eq.${userId},scope.eq.team`)
      .order('created_at', { ascending: false })
      .limit(60),
    admin
      .from('assistant_tasks')
      .select('id, title, priority, status, due_date, due_at, created_at, owner_id, created_by')
      .or(`owner_id.eq.${userId},created_by.eq.${userId}`)
      .neq('status', 'done')
      .limit(40),
    loadDialpadCalls(40, { userId, email, dialpadUserId }, { teamWide: false }),
  ]);

  const now = new Date();
  const todayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const todayDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const past: string[] = [];
  const upcoming: string[] = [];
  for (const e of calendar.events) {
    const s = new Date(e.start);
    const line = `- ${s.toLocaleDateString('en-US', { weekday: 'short' })} ${fmtClock(s.getTime())} "${e.title}"${e.attendeeCount ? ` (${e.attendeeCount} attendees)` : ''}`;
    (s.getTime() < now.getTime() ? past : upcoming).push(line);
  }

  const recapTxt = emailResult.recaps.length
    ? emailResult.recaps
        .map(
          (r) =>
            `- "${r.title}" — ${r.summary.slice(0, 160)}${r.actionItems.length ? ` | actions: ${r.actionItems.slice(0, 3).join('; ')}` : ''}`,
        )
        .join('\n')
    : '(none)';

  const inboxTxt = emailResult.email.inbox.length
    ? emailResult.email.inbox
        .slice(0, 25)
        .map(
          (m, i) =>
            `${i + 1}. id=${m.id} | from=${m.from} | subject=${m.subject} | ${m.isUnread ? 'UNREAD' : 'read'} | received=${new Date(m.receivedTime).toISOString()} | ${m.summary.slice(0, 120)}`,
        )
        .join('\n')
    : '(inbox empty or not connected)';

  // Flag unclaimed portal work that is approaching its 24–48h turnaround SLA.
  const hoursSince = (iso: string): number => {
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? 0 : (now.getTime() - t) / 3_600_000;
  };
  const slaFor = (a: (typeof actions)[number]): 'breached' | 'approaching' | null => {
    if (!a.ticketKind) return null;
    const claimed = claimedKeys.has(`${a.ticketKind}:${a.sourceId}`);
    if (claimed) return null;
    const hrs = hoursSince(a.createdAt);
    if (hrs >= 48) return 'breached';
    if (hrs >= 24) return 'approaching';
    return null;
  };

  const actionsTxt = actions.length
    ? actions
        .slice(0, 25)
        .map((a) => {
          const claimed = a.ticketKind ? claimedKeys.has(`${a.ticketKind}:${a.sourceId}`) : false;
          const sla = slaFor(a);
          const flags = [
            claimed ? 'CLAIMED' : 'UNCLAIMED',
            sla === 'breached' ? 'SLA-BREACHED(>48h)' : sla === 'approaching' ? 'SLA-APPROACHING(24-48h)' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return `- actionId=${a.id} [${a.kind}] ${a.title}${a.who ? ` (${a.who})` : ''} — ${a.subtitle} | firstSeen=${a.createdAt} | ${flags}`;
        })
        .join('\n')
    : '(none)';

  const mentionsTxt = mentions.length
    ? mentions
        .slice(0, 20)
        .map(
          (m) =>
            `- mentionId=${m.id} | from=${m.authorName} | where=${m.contextLabel} | when=${m.createdAt} | "${m.body.slice(0, 140)}"`,
        )
        .join('\n')
    : '(none)';

  // Inbound calls the user never connected on (missed / voicemail / no-answer)
  // are callbacks owed to a contact, so they belong in the brief like an unread
  // email does.
  const calls = callsResult.calls;
  const isMissedCall = (c: AssistantCall): boolean => {
    if (c.direction === 'outbound') return false;
    const s = (c.state ?? '').toLowerCase();
    if (/(missed|voicemail|no.?answer|abandon|reject|declin|unanswered)/.test(s)) return true;
    // Inbound with no talk time and not explicitly connected ≈ missed.
    if (c.direction === 'inbound' && (c.durationSeconds ?? 0) === 0 && !/connect|complet|answer/.test(s)) {
      return true;
    }
    return false;
  };
  const dismissals = await loadAssistantDismissals(userId);
  const missedCalls = filterMissedCallsByDismissals(calls.filter(isMissedCall), dismissals);
  const callLabel = (c: AssistantCall): string =>
    c.contactName || c.contactPhone || c.contactEmail || 'Unknown caller';
  const callsTxt = missedCalls.length
    ? missedCalls
        .slice(0, 15)
        .map(
          (c) =>
            `- callId=${c.id} | from=${callLabel(c)}${c.contactPhone ? ` (${c.contactPhone})` : ''} | ${c.state ?? 'missed'} | when=${c.startedAt ?? 'unknown'}${c.recapSummary ? ` | ${c.recapSummary.slice(0, 100)}` : ''}`,
        )
        .join('\n')
    : '(none)';

  // Deterministic date lookups so "since" + "what you missed" reflect real
  // item timestamps rather than anything the model might guess.
  const emailDateById = new Map(emailResult.email.inbox.map((m) => [m.id, new Date(m.receivedTime).toISOString()]));
  const actionDateById = new Map(actions.map((a) => [a.id, a.createdAt]));
  const mentionDateById = new Map(mentions.map((m) => [m.id, m.createdAt]));
  const callDateById = new Map(missedCalls.map((c) => [c.id, c.startedAt ?? null]));
  const sinceForRef = (ref: AssistantRef | null): string | null => {
    if (!ref) return null;
    if (ref.type === 'email') return emailDateById.get(ref.id) ?? null;
    if (ref.type === 'action') return actionDateById.get(ref.id) ?? null;
    if (ref.type === 'mention') return mentionDateById.get(ref.id) ?? null;
    if (ref.type === 'call') return callDateById.get(ref.id) ?? null;
    return null;
  };

  const deterministicInput = {
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
  const missedTop = buildMissedItems(deterministicInput);
  const fallbackPriorities = buildTodayPriorities(deterministicInput);

  const tasksTxt = (tasksRes.data ?? []).length
    ? (tasksRes.data ?? [])
        .map((t) => {
          const delegated = String(t.owner_id) === userId && String(t.created_by) !== userId;
          const submitted = String(t.created_by) !== userId;
          const tag = delegated || submitted ? ' [from a teammate]' : '';
          const dueIso = (t.due_at as string | null) ?? (t.due_date ? String(t.due_date) : null);
          const overdue = dueIso && new Date(dueIso).getTime() < now.getTime();
          const dueTxt = dueIso ? ` (due ${dueIso.slice(0, 10)}${overdue ? ' OVERDUE' : ''})` : '';
          return `- [${String(t.priority).toUpperCase()}] "${t.title}"${dueTxt}${tag}`;
        })
        .join('\n')
    : '(none)';

  const contextTxt = (contextRes.data ?? []).length
    ? (contextRes.data ?? []).map((c) => `- ${c.subject}: ${c.info}`).join('\n')
    : '(none yet)';

  const systemStatic = `You are the executive assistant for a Candid team member (technology & payments advisory). You produce a sharp daily brief and triage their inbox.

Be specific, reference real names/companies/subjects from the day's data, and never invent data not present. Output ONLY valid JSON, no prose, no code fences.

Return a JSON object with EXACTLY this shape:
{
  "brief": {
    "weekStatus": "one short sentence on where things stand right now",
    "highlights": ["3-5 short factual bullets of what's happened / been handled so far"],
    "priorities": [{"title": "specific actionable item", "why": "one-line rationale", "ref": {"type":"email","id":"<inbox id>"}, "intent": "reply" } ...3-5 ordered by importance across ALL sources],
    "recommendation": "one sentence: the single most important thing to do RIGHT NOW",
    "recommendationRef": {"type":"email","id":"<inbox id>"},
    "recommendationIntent": "reply"
  },
  "triagedEmails": [
    {"id":"<inbox id>","contact":"Name","business":"Company or Unknown","title":"short task title","subject":"reply subject","insight":"one line why it needs a reply","tag":"urgent|partner|customer|renewal","section":"urgent|action|monitor"}
  ]
}

CRITICAL — make every priority and the recommendation ACTIONABLE with both a "ref" (deep-link) and an "intent" (what to do):
- ref types: {"type":"email","id":"<inbox id>"}, {"type":"action","id":"<actionId>"}, {"type":"mention","id":"<mentionId>"}, {"type":"call","id":"<callId>"}, {"type":"calendar"}, {"type":"task"}. Omit ref (null) only if truly none apply. NEVER invent ids — only use ids that appear in the day's data.
- intent: "reply" | "schedule" | "call" | "open" | "review".
- The "recommendation" is the single highest-impact next action.

For triagedEmails: include ONLY inbox messages that genuinely need a reply or action. Ignore newsletters, receipts, automated notifications, and marketing. Use exact ids from the inbox list. If nothing needs action, return an empty array.

Sources to weigh (most urgent wins): email needing reply; meetings; portal tickets (especially SLA-APPROACHING/BREACHED); open tasks & teammate assignments; @mentions; missed calls/voicemails.`;

  const systemVolatile = `Assistant for: ${displayName}. Today is ${todayName}, ${todayDate}.

## Meetings earlier this week / today
${past.length ? past.join('\n') : '(none yet)'}

## Meetings still ahead
${upcoming.length ? upcoming.join('\n') : '(none scheduled)'}

## Dialpad call recaps
${recapTxt}

## Portal action items (tickets, reviews, reminders) — claim state + SLA
${actionsTxt}

## @Mentions from teammates (unread)
${mentionsTxt}

## Missed calls & voicemails (callbacks owed)
${callsTxt}

## My open tasks (incl. ones teammates submitted)
${tasksTxt}

## Things I remember (context/memory)
${contextTxt}

## Recent inbox (for triage)
${inboxTxt}`;

  const userPrompt = `Build ${displayName}'s daily brief and triage from the day data in the system context. Weigh every source; most urgent wins. Output ONLY the JSON object.`;

  let parsed: { brief?: Partial<AssistantBrief>; triagedEmails?: unknown[] } | null = null;
  try {
    const raw = await askHankServer([{ role: 'user', content: userPrompt }], {
      systemPrompt: systemStatic,
      systemVolatile,
      maxTokens: 2000,
      routeLabel: 'assistant-brief',
      userId,
      usageTrigger: usageTrigger ?? 'auto_refresh',
    });
    parsed = extractJson(raw) as { brief?: Partial<AssistantBrief>; triagedEmails?: unknown[] } | null;
  } catch (err) {
    console.error('Brief AI generation failed, using deterministic fallback:', err);
  }

  const validIds = new Set(emailResult.email.inbox.map((m) => m.id));
  const validActionIds = new Set(actions.map((a) => a.id));
  const validMentionIds = new Set(mentions.map((m) => m.id));
  const validCallIds = new Set(missedCalls.map((c) => c.id));

  const normalizeRef = (raw: unknown): AssistantRef | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as { type?: unknown; id?: unknown };
    const type = String(r.type ?? '');
    const id = r.id != null ? String(r.id) : '';
    if (type === 'email') return validIds.has(id) ? { type: 'email', id } : null;
    if (type === 'action') return validActionIds.has(id) ? { type: 'action', id } : null;
    if (type === 'mention') return validMentionIds.has(id) ? { type: 'mention', id } : null;
    if (type === 'call') return validCallIds.has(id) ? { type: 'call', id } : null;
    if (type === 'calendar') return { type: 'calendar' };
    if (type === 'task') return { type: 'task' };
    if (type === 'recap') return { type: 'recap', id };
    return null;
  };

  const INTENTS: AssistantIntent[] = ['reply', 'schedule', 'open', 'call', 'review'];
  const normalizeIntent = (raw: unknown, ref: AssistantRef | null): AssistantIntent | null => {
    const v = String(raw ?? '');
    if ((INTENTS as string[]).includes(v)) return v as AssistantIntent;
    // Sensible default from the ref type when the model omits it.
    if (ref?.type === 'email') return 'reply';
    if (ref?.type === 'call') return 'call';
    if (ref?.type === 'action' || ref?.type === 'mention' || ref?.type === 'task') return 'open';
    if (ref?.type === 'calendar') return 'schedule';
    return null;
  };

  const aiPriorities: AssistantPriority[] = Array.isArray(parsed?.brief?.priorities)
    ? parsed!.brief!.priorities!.map((p) => {
        const ref = normalizeRef((p as { ref?: unknown }).ref);
        return {
          title: String((p as { title?: unknown }).title ?? ''),
          why: String((p as { why?: unknown }).why ?? ''),
          ref,
          intent: normalizeIntent((p as { intent?: unknown }).intent, ref),
          since: sinceForRef(ref),
        };
      }).filter((p) => p.title)
    : [];

  const prioritiesRaw = mergePriorities(aiPriorities, fallbackPriorities);
  const dismissedTitles = new Set(
    dismissals
      .filter((d) => d.refType === 'priority_title' || d.refType === 'missed_title')
      .map((d) => d.refId.toLowerCase()),
  );
  const dismissedCallIds = new Set(
    dismissals.filter((d) => d.refType === 'call').map((d) => d.refId),
  );
  const priorities = prioritiesRaw
    .filter((p) => {
      if (dismissedTitles.has(p.title.toLowerCase())) return false;
      if (p.ref?.type === 'call' && dismissedCallIds.has(p.ref.id)) return false;
      return true;
    })
    .slice(0, 6);
  const missedFiltered = missedTop.filter((m) => {
    if (dismissedTitles.has(m.title.toLowerCase())) return false;
    if (m.ref?.type === 'call' && dismissedCallIds.has(m.ref.id)) return false;
    return true;
  });
  const topPriority = priorities[0] ?? null;
  const recommendationRef = normalizeRef(
    (parsed?.brief as { recommendationRef?: unknown } | undefined)?.recommendationRef,
  );
  const recommendationIntent = normalizeIntent(
    (parsed?.brief as { recommendationIntent?: unknown } | undefined)?.recommendationIntent,
    recommendationRef ?? topPriority?.ref ?? null,
  );

  const brief: AssistantBrief = {
    weekStatus:
      String(parsed?.brief?.weekStatus ?? '').trim() ||
      (priorities.length > 0
        ? `${priorities.length} ${priorities.length === 1 ? 'priority needs' : 'priorities need'} your attention today.`
        : ''),
    highlights: Array.isArray(parsed?.brief?.highlights)
      ? parsed!.brief!.highlights!.map((h) => String(h)).slice(0, 6)
      : [],
    priorities,
    missed: missedFiltered,
    recommendation:
      String(parsed?.brief?.recommendation ?? '').trim() || topPriority?.title || '',
    recommendationRef: recommendationRef ?? topPriority?.ref ?? null,
    recommendationIntent: recommendationIntent ?? topPriority?.intent ?? null,
    generatedAt: new Date().toISOString(),
  };
  const inboxMetaById = new Map(
    emailResult.email.inbox.map((m) => [
      m.id,
      { fromAddress: m.fromAddress || m.from, folderId: m.folderId, receivedTime: m.receivedTime },
    ]),
  );
  const triagedEmails: TriagedEmail[] = Array.isArray(parsed?.triagedEmails)
    ? (parsed!.triagedEmails as Record<string, unknown>[])
        .map((t) => {
          const id = String(t.id ?? '');
          const meta = inboxMetaById.get(id);
          return {
            id,
            contact: String(t.contact ?? 'Unknown'),
            business: String(t.business ?? 'Unknown'),
            title: String(t.title ?? t.subject ?? 'Follow up'),
            subject: String(t.subject ?? ''),
            insight: String(t.insight ?? ''),
            tag: (['urgent', 'partner', 'customer', 'renewal'].includes(String(t.tag))
              ? t.tag
              : 'customer') as TriagedEmail['tag'],
            section: (['urgent', 'action', 'monitor'].includes(String(t.section))
              ? t.section
              : 'action') as TriagedEmail['section'],
            fromAddress: meta?.fromAddress,
            folderId: meta?.folderId,
            receivedTime: meta?.receivedTime,
          };
        })
        .filter((t) => t.id && validIds.has(t.id))
        .filter((t) => !emailResult.email.externallyHandledIds?.includes(t.id))
    : [];

  const result: AssistantBriefResult = { brief, triagedEmails };

  await admin.from('assistant_briefs').upsert(
    {
      owner_id: userId,
      brief: result as unknown as Record<string, unknown>,
      generated_at: new Date().toISOString(),
    },
    { onConflict: 'owner_id' },
  );

  return result;
}

export async function GET() {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from('assistant_briefs')
    .select('brief, generated_at')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (data?.brief) {
    const cached = data.brief as unknown as AssistantBriefResult;
    if (cached.brief && !Array.isArray(cached.brief.missed)) {
      cached.brief.missed = [];
    }
    if (!cached.brief.generatedAt && data.generated_at) {
      cached.brief.generatedAt = data.generated_at;
    }
    const hasContent =
      Boolean(cached.brief?.weekStatus?.trim()) ||
      (cached.brief?.priorities?.length ?? 0) > 0 ||
      (cached.brief?.highlights?.length ?? 0) > 0 ||
      (cached.brief?.missed?.length ?? 0) > 0;
    if (hasContent) {
      return NextResponse.json({ ...cached, cached: true });
    }
  }

  try {
    const instant = await loadInstantBrief(user.id, user.email ?? null);
    return NextResponse.json({ ...instant, cached: false, provisional: true });
  } catch {
    return NextResponse.json({ brief: EMPTY_BRIEF, triagedEmails: [], cached: true } as AssistantBriefResult & {
      cached: boolean;
    });
  }
}

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === '1' || searchParams.get('force') === 'true';

  const admin = createSupabaseAdminClient();
  if (!force) {
    const { data } = await admin
      .from('assistant_briefs')
      .select('brief, generated_at')
      .eq('owner_id', user.id)
      .maybeSingle();
    if (data?.brief) {
      const cached = data.brief as unknown as AssistantBriefResult;
      const generatedAt = cached.brief?.generatedAt ?? data.generated_at;
      const missingPriorities =
        (cached.brief?.missed?.length ?? 0) > 0 && (cached.brief?.priorities?.length ?? 0) === 0;
      if (briefCacheIsFresh(generatedAt) && !missingPriorities) {
        if (cached.brief && !Array.isArray(cached.brief.missed)) {
          cached.brief.missed = [];
        }
        return NextResponse.json({ ...cached, cached: true });
      }
    }
  }

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.email ? user.email.split('@')[0] : 'there');

  try {
    const result = await generate(
      user.id,
      displayName,
      user.email ?? null,
      force ? 'manual_sync' : 'auto_refresh',
    );
    return NextResponse.json({ ...result, cached: false });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Brief generation failed' },
      { status: 500 },
    );
  }
}
