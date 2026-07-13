import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { askHankServer } from '@/lib/hank/server';
import { loadActions, loadCalendar, loadEmailAndRecaps, loadMentions } from '@/lib/assistant/data';
import type { AssistantBriefResult, AssistantChatAction } from '@/lib/assistant/types';

export const dynamic = 'force-dynamic';

async function currentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

function parseResponse(text: string): { message: string; actions: AssistantChatAction[] } {
  let t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) t = fenced[1].trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s !== -1 && e !== -1 && e > s) {
    try {
      const obj = JSON.parse(t.slice(s, e + 1)) as {
        message?: string;
        actions?: AssistantChatAction[];
      };
      return {
        message: String(obj.message ?? text),
        actions: Array.isArray(obj.actions) ? obj.actions : [],
      };
    } catch {
      /* ignore */
    }
  }
  return { message: text, actions: [] };
}

function briefSummaryBlock(cached: AssistantBriefResult | null): string {
  if (!cached?.brief) return '(no brief generated yet)';
  const b = cached.brief;
  const lines: string[] = [];
  if (b.weekStatus) lines.push(`Status: ${b.weekStatus}`);
  if (b.recommendation) lines.push(`Top recommendation: ${b.recommendation}`);
  if (b.priorities?.length) {
    lines.push('Priorities:');
    for (const p of b.priorities.slice(0, 6)) {
      lines.push(`- ${p.title}${p.why ? ` — ${p.why}` : ''}`);
    }
  }
  if (b.highlights?.length) {
    lines.push('Highlights:');
    for (const h of b.highlights.slice(0, 5)) lines.push(`- ${h}`);
  }
  if (cached.triagedEmails?.length) {
    lines.push('Triaged emails in brief:');
    for (const t of cached.triagedEmails.slice(0, 12)) {
      lines.push(`- [${t.id}] ${t.contact} / ${t.business}: ${t.subject || t.title} (${t.section})`);
    }
  }
  return lines.length ? lines.join('\n') : '(brief is empty)';
}

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as {
    messages?: { role: 'user' | 'assistant'; content: string }[];
  };
  const messages = (body.messages ?? []).filter(
    (m) => (m.role === 'user' || m.role === 'assistant') && m.content?.trim(),
  );
  if (!messages.length) return NextResponse.json({ error: 'messages required' }, { status: 400 });

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.email ? user.email.split('@')[0] : 'there');

  const admin = createSupabaseAdminClient();

  const calendar = await loadCalendar(user.id).catch(() => ({ events: [] as Awaited<ReturnType<typeof loadCalendar>>['events'] }));

  const [contextRes, tasksRes, briefRes, emailResult, actions, mentions] = await Promise.all([
    admin
      .from('assistant_context')
      .select('subject, info, scope')
      .or(`owner_id.eq.${user.id},scope.eq.team`)
      .order('created_at', { ascending: false })
      .limit(60),
    admin
      .from('assistant_tasks')
      .select('title, priority, status')
      .or(`owner_id.eq.${user.id},created_by.eq.${user.id}`)
      .neq('status', 'done')
      .limit(40),
    admin
      .from('assistant_briefs')
      .select('brief')
      .eq('owner_id', user.id)
      .maybeSingle(),
    loadEmailAndRecaps(user.id, calendar.events).catch(() => ({
      email: {
        connected: false as const,
        inbox: [] as import('@/lib/assistant/types').AssistantEmailItem[],
        needsAction: [] as import('@/lib/assistant/types').AssistantEmailItem[],
      },
      recaps: [] as { title: string; summary: string }[],
    })),
    loadActions().catch(() => []),
    loadMentions(user.id).catch(() => []),
  ]);

  const contextTxt = (contextRes.data ?? []).length
    ? (contextRes.data ?? []).map((c) => `- ${c.subject}: ${c.info}`).join('\n')
    : '(none yet)';
  const tasksTxt = (tasksRes.data ?? []).length
    ? (tasksRes.data ?? []).map((t) => `- [${t.priority}] ${t.title} (${t.status})`).join('\n')
    : '(none)';

  const cachedBrief = (briefRes.data?.brief as AssistantBriefResult | undefined) ?? null;
  const briefTxt = briefSummaryBlock(cachedBrief);

  const inboxTxt = emailResult.email.inbox.length
    ? emailResult.email.inbox
        .slice(0, 30)
        .map(
          (m) =>
            `- [${m.id}] from:${m.from} | ${m.isUnread ? 'UNREAD' : 'read'} | ${new Date(m.receivedTime).toISOString()} | ${m.subject} | ${(m.summary ?? '').slice(0, 120)}`,
        )
        .join('\n')
    : '(no inbox messages loaded)';

  const upcomingMeetings = calendar.events
    .filter((e) => new Date(e.start).getTime() >= Date.now())
    .slice(0, 12)
    .map((e) => `- ${e.start} "${e.title}"`)
    .join('\n') || '(none upcoming)';

  const actionsTxt = actions.length
    ? actions
        .slice(0, 20)
        .map((a) => `- [${a.id}] ${a.title}${a.who ? ` (${a.who})` : ''}`)
        .join('\n')
    : '(none)';

  const mentionsTxt = mentions.length
    ? mentions
        .slice(0, 15)
        .map((m) => `- [${m.id}] ${m.authorName}: ${m.body.slice(0, 100)}`)
        .join('\n')
    : '(none)';

  const systemStatic = `You are ${displayName}'s personal work assistant inside the Candid admin portal (technology & payments advisory). You can see their My Assistant Brief, recent inbox (subjects/summaries), calendar, portal actions, @mentions, open tasks, and remembered context — the same workspace as My Assistant.

When they ask why an email was or wasn't in the Brief, check the "Today's Brief" triage list AND the "Recent inbox" list. Explain clearly. If an important email is in the inbox but missing from triage, acknowledge that, explain likely reasons (newsletter-like, automated, etc.), and offer to add a priority task or remember why it matters.

## How to respond
Respond with ONLY a JSON object (no markdown, no code fences):
{ "message": "your conversational reply", "actions": [ ...optional ] }

Available actions:
1. {"type":"add_task","title":"...","priority":"low|normal|high|urgent"}  — create a task for the user
2. {"type":"remember","subject":"Person or Company","info":"the fact to remember"}  — save context to memory

Use add_task when the user asks to create/track something (including "add this email to my priorities"). Use remember when the user shares a durable fact. Keep "message" concise and friendly. Respond ONLY with valid JSON.`;

  const systemVolatile = `## Today's Brief (cached)
${briefTxt}

## Recent inbox (subjects & summaries — you CAN see these)
${inboxTxt}

## Upcoming meetings
${upcomingMeetings}

## Portal action items
${actionsTxt}

## Unread @mentions
${mentionsTxt}

## Things you remember
${contextTxt}

## Open tasks
${tasksTxt}`;

  let raw: string;
  try {
    raw = await askHankServer(
      messages.map((m) => ({ role: m.role, content: m.content })),
      {
        systemPrompt: systemStatic,
        systemVolatile,
        maxTokens: 1200,
        routeLabel: 'assistant-chat',
        userId: user.id,
      },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Chat failed' },
      { status: 500 },
    );
  }

  const parsed = parseResponse(raw);
  const applied: AssistantChatAction[] = [];

  for (const action of parsed.actions) {
    try {
      if (action.type === 'add_task' && action.title?.trim()) {
        await admin.from('assistant_tasks').insert({
          owner_id: action.ownerId || user.id,
          created_by: user.id,
          title: action.title.trim(),
          priority: ['low', 'normal', 'high', 'urgent'].includes(action.priority ?? '')
            ? action.priority
            : 'normal',
          source: 'mention',
        });
        applied.push(action);
      } else if (action.type === 'remember' && action.subject?.trim() && action.info?.trim()) {
        await admin.from('assistant_context').insert({
          owner_id: user.id,
          subject: action.subject.trim(),
          info: action.info.trim(),
          source: 'chat',
          scope: action.scope === 'team' ? 'team' : 'personal',
        });
        applied.push(action);
      }
    } catch {
      /* skip failed action */
    }
  }

  return NextResponse.json({ message: parsed.message, actions: applied });
}
