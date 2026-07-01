import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { askHankServer } from '@/lib/hank/server';
import {
  loadActions,
  loadCalendar,
  loadClaimedActionKeys,
  loadEmailAndRecaps,
  loadMentions,
} from '@/lib/assistant/data';
import { loadDialpadCalls, dialpadUserIdForEmail } from '@/lib/dialpad/sync';
import type {
  AssistantBrief,
  AssistantBriefResult,
  AssistantCall,
  AssistantIntent,
  AssistantMissed,
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

async function generate(userId: string, displayName: string, email: string | null): Promise<AssistantBriefResult> {
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
  const missedCalls = calls.filter(isMissedCall);
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
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
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

  // Carry-over items: open before today and still not done. Unclaimed work that
  // is breaching/approaching its SLA jumps to the top regardless of age.
  const missed: AssistantMissed[] = [];
  for (const a of actions) {
    const sla = slaFor(a);
    const old = new Date(a.createdAt).getTime() < startOfToday.getTime();
    if (sla || old) {
      missed.push({
        title: a.title,
        why: `${a.subtitle}${a.who ? ` · ${a.who}` : ''}${sla === 'breached' ? ' · ⚠ past 48h SLA' : sla === 'approaching' ? ' · ⏳ nearing 48h SLA' : ''}`,
        ref: { type: 'action', id: a.id },
        intent: 'open',
        since: a.createdAt,
      });
    }
  }
  for (const m of emailResult.email.inbox) {
    if (m.isUnread && m.receivedTime < startOfToday.getTime()) {
      missed.push({
        title: `Reply to ${m.from}`,
        why: m.subject,
        ref: { type: 'email', id: m.id },
        intent: 'reply',
        since: new Date(m.receivedTime).toISOString(),
      });
    }
  }
  for (const mn of mentions) {
    if (new Date(mn.createdAt).getTime() < startOfToday.getTime()) {
      missed.push({
        title: `${mn.authorName} mentioned you`,
        why: `${mn.contextLabel} · ${mn.body.slice(0, 80)}`,
        ref: { type: 'mention', id: mn.id },
        intent: 'open',
        since: mn.createdAt,
      });
    }
  }
  for (const c of missedCalls) {
    const when = c.startedAt ? new Date(c.startedAt).getTime() : 0;
    if (when && when < startOfToday.getTime()) {
      missed.push({
        title: `Call back ${callLabel(c)}`,
        why: `${/voicemail/i.test(c.state ?? '') ? 'Voicemail' : 'Missed call'}${c.contactPhone ? ` · ${c.contactPhone}` : ''}`,
        ref: { type: 'call', id: c.id },
        intent: 'call',
        since: c.startedAt ?? undefined,
      });
    }
  }
  for (const t of tasksRes.data ?? []) {
    const dueIso = (t.due_at as string | null) ?? (t.due_date ? `${t.due_date}T12:00:00Z` : null);
    const overdue = dueIso && new Date(dueIso).getTime() < now.getTime();
    const createdIso = t.created_at ? String(t.created_at) : null;
    if (overdue || (createdIso && new Date(createdIso).getTime() < startOfToday.getTime())) {
      missed.push({
        title: String(t.title),
        why: overdue
          ? `Overdue task · was due ${dueIso?.slice(0, 10) ?? ''}`
          : `Open task${dueIso ? ` · due ${dueIso.slice(0, 10)}` : ''}`,
        ref: { type: 'task' },
        intent: overdue ? 'open' : 'open',
        since: createdIso ?? undefined,
      });
    }
  }
  missed.sort((a, b) => new Date(a.since ?? 0).getTime() - new Date(b.since ?? 0).getTime());
  const missedTop = missed.slice(0, 8);

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

  const systemPrompt = `You are the executive assistant for ${displayName}, a team member at Candid, a technology & payments advisory firm that helps businesses analyze bills and find better suppliers. You produce a sharp daily brief and triage their inbox. Be specific, reference real names/companies/subjects, and never invent data not present below. Output ONLY valid JSON, no prose, no code fences.`;

  const userPrompt = `Today is ${todayName}, ${todayDate}.

You are building ${displayName}'s single most important "what to focus on first" brief by weighing EVERY source below against each other. The brief is the executive summary of everything on the rest of their dashboard, so they never have to scroll or hunt.

Sources to weigh (most urgent wins):
1. Email needing a reply.
2. Meetings today/this week (especially prep or follow-ups).
3. Portal tickets & action items — give extra weight to UNCLAIMED items marked SLA-APPROACHING (24–48h) or SLA-BREACHED (>48h); those are turnaround-deadline risks.
4. My own priorities & open tasks, AND tasks a teammate submitted/assigned to me ([from a teammate]).
5. @mentions from teammates that need my response.
6. Missed calls & voicemails that owe the contact a callback.

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
${inboxTxt}

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
- ref types: {"type":"email","id":"<inbox id>"}, {"type":"action","id":"<actionId>"}, {"type":"mention","id":"<mentionId>"}, {"type":"call","id":"<callId>"}, {"type":"calendar"}, {"type":"task"}. Omit ref (null) only if truly none apply. NEVER invent ids — only use ids that appear above.
- intent (pick the one matching what the user must DO): "reply" (send an email back), "schedule" (book a meeting/call with someone), "call" (phone them), "open" (open/view the item to work it), "review" (read & decide). Example: "Book a call with Maria" → intent "schedule"; "Respond to Acme's billing question" → intent "reply".
- The "recommendation" is the single highest-impact next action. Prefer an item with a ref + intent so it's one click.

For triagedEmails: include ONLY inbox messages that genuinely need a reply or action from ${displayName}. Ignore newsletters, receipts, automated notifications, and marketing. Use the exact id from the inbox list. If nothing needs action, return an empty array.`;

  const raw = await askHankServer([{ role: 'user', content: userPrompt }], {
    systemPrompt,
    maxTokens: 2000,
  });

  const parsed = extractJson(raw) as
    | { brief?: Partial<AssistantBrief>; triagedEmails?: unknown[] }
    | null;

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

  const brief: AssistantBrief = {
    weekStatus: String(parsed?.brief?.weekStatus ?? ''),
    highlights: Array.isArray(parsed?.brief?.highlights)
      ? parsed!.brief!.highlights!.map((h) => String(h)).slice(0, 6)
      : [],
    priorities: Array.isArray(parsed?.brief?.priorities)
      ? parsed!.brief!.priorities!.map((p) => {
          const ref = normalizeRef((p as { ref?: unknown }).ref);
          return {
            title: String((p as { title?: unknown }).title ?? ''),
            why: String((p as { why?: unknown }).why ?? ''),
            ref,
            intent: normalizeIntent((p as { intent?: unknown }).intent, ref),
            since: sinceForRef(ref),
          };
        }).filter((p) => p.title).slice(0, 6)
      : [],
    missed: missedTop,
    recommendation: String(parsed?.brief?.recommendation ?? ''),
    recommendationRef: normalizeRef((parsed?.brief as { recommendationRef?: unknown } | undefined)?.recommendationRef),
    recommendationIntent: normalizeIntent(
      (parsed?.brief as { recommendationIntent?: unknown } | undefined)?.recommendationIntent,
      normalizeRef((parsed?.brief as { recommendationRef?: unknown } | undefined)?.recommendationRef),
    ),
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
    .select('brief')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (data?.brief) {
    const cached = data.brief as unknown as AssistantBriefResult;
    if (cached.brief && !Array.isArray(cached.brief.missed)) {
      cached.brief.missed = [];
    }
    return NextResponse.json(cached);
  }
  return NextResponse.json({ brief: EMPTY_BRIEF, triagedEmails: [] } as AssistantBriefResult);
}

export async function POST() {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.email ? user.email.split('@')[0] : 'there');

  try {
    const result = await generate(user.id, displayName, user.email ?? null);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Brief generation failed' },
      { status: 500 },
    );
  }
}
