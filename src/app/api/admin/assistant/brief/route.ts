import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { askHankServer } from '@/lib/hank/server';
import { loadActions, loadCalendar, loadEmailAndRecaps } from '@/lib/assistant/data';
import type {
  AssistantBrief,
  AssistantBriefResult,
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

async function generate(userId: string, displayName: string): Promise<AssistantBriefResult> {
  const admin = createSupabaseAdminClient();

  const calendar = await loadCalendar(userId);
  const [emailResult, actions, contextRes, tasksRes] = await Promise.all([
    loadEmailAndRecaps(userId, calendar.events),
    loadActions(),
    admin
      .from('assistant_context')
      .select('subject, info')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .limit(40),
    admin
      .from('assistant_tasks')
      .select('title, priority, status, due_date')
      .or(`owner_id.eq.${userId},created_by.eq.${userId}`)
      .neq('status', 'done')
      .limit(40),
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
            `${i + 1}. id=${m.id} | from=${m.from} | subject=${m.subject} | ${m.isUnread ? 'UNREAD' : 'read'} | ${m.summary.slice(0, 120)}`,
        )
        .join('\n')
    : '(inbox empty or not connected)';

  const actionsTxt = actions.length
    ? actions
        .slice(0, 25)
        .map((a) => `- actionId=${a.id} [${a.kind}] ${a.title}${a.who ? ` (${a.who})` : ''} — ${a.subtitle}`)
        .join('\n')
    : '(none)';

  const tasksTxt = (tasksRes.data ?? []).length
    ? (tasksRes.data ?? [])
        .map((t) => `- [${String(t.priority).toUpperCase()}] "${t.title}"${t.due_date ? ` (due ${t.due_date})` : ''}`)
        .join('\n')
    : '(none)';

  const contextTxt = (contextRes.data ?? []).length
    ? (contextRes.data ?? []).map((c) => `- ${c.subject}: ${c.info}`).join('\n')
    : '(none yet)';

  const systemPrompt = `You are the executive assistant for ${displayName}, a team member at Candid, a technology & payments advisory firm that helps businesses analyze bills and find better suppliers. You produce a sharp daily brief and triage their inbox. Be specific, reference real names/companies/subjects, and never invent data not present below. Output ONLY valid JSON, no prose, no code fences.`;

  const userPrompt = `Today is ${todayName}, ${todayDate}.

## Meetings earlier this week / today
${past.length ? past.join('\n') : '(none yet)'}

## Meetings still ahead
${upcoming.length ? upcoming.join('\n') : '(none scheduled)'}

## Dialpad call recaps
${recapTxt}

## Open portal action items (tickets, reviews, reminders)
${actionsTxt}

## My open tasks
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
    "priorities": [{"title": "specific actionable item", "why": "one-line rationale", "ref": {"type":"email","id":"<inbox id>"} } ...3-5 ordered by importance],
    "recommendation": "one sentence: where to start RIGHT NOW given the time of day",
    "recommendationRef": {"type":"email","id":"<inbox id>"}
  },
  "triagedEmails": [
    {"id":"<inbox id>","contact":"Name","business":"Company or Unknown","title":"short task title","subject":"reply subject","insight":"one line why it needs a reply","tag":"urgent|partner|customer|renewal","section":"urgent|action|monitor"}
  ]
}

CRITICAL — make every priority and the recommendation ACTIONABLE by attaching a "ref" that deep-links to the exact item it's about:
- If it's about replying to an email, use {"type":"email","id":"<the exact inbox id>"}.
- If it's about a portal action item, use {"type":"action","id":"<the actionId>"}.
- If it's about a meeting/calendar, use {"type":"calendar"}.
- If it's about an open task, use {"type":"task"}.
- If none apply, omit ref (set to null). NEVER invent ids — only use ids that appear above.
The "recommendation" should be the single most important next action; prefer attaching an email ref so the user can respond in one click.

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

  const normalizeRef = (raw: unknown): AssistantRef | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as { type?: unknown; id?: unknown };
    const type = String(r.type ?? '');
    const id = r.id != null ? String(r.id) : '';
    if (type === 'email') return validIds.has(id) ? { type: 'email', id } : null;
    if (type === 'action') return validActionIds.has(id) ? { type: 'action', id } : null;
    if (type === 'calendar') return { type: 'calendar' };
    if (type === 'task') return { type: 'task' };
    if (type === 'recap') return { type: 'recap', id };
    return null;
  };

  const brief: AssistantBrief = {
    weekStatus: String(parsed?.brief?.weekStatus ?? ''),
    highlights: Array.isArray(parsed?.brief?.highlights)
      ? parsed!.brief!.highlights!.map((h) => String(h)).slice(0, 6)
      : [],
    priorities: Array.isArray(parsed?.brief?.priorities)
      ? parsed!.brief!.priorities!.map((p) => ({
          title: String((p as { title?: unknown }).title ?? ''),
          why: String((p as { why?: unknown }).why ?? ''),
          ref: normalizeRef((p as { ref?: unknown }).ref),
        })).filter((p) => p.title).slice(0, 6)
      : [],
    recommendation: String(parsed?.brief?.recommendation ?? ''),
    recommendationRef: normalizeRef((parsed?.brief as { recommendationRef?: unknown } | undefined)?.recommendationRef),
    generatedAt: new Date().toISOString(),
  };
  const triagedEmails: TriagedEmail[] = Array.isArray(parsed?.triagedEmails)
    ? (parsed!.triagedEmails as Record<string, unknown>[])
        .map((t) => ({
          id: String(t.id ?? ''),
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
        }))
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
    return NextResponse.json(data.brief as unknown as AssistantBriefResult);
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
    const result = await generate(user.id, displayName);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Brief generation failed' },
      { status: 500 },
    );
  }
}
