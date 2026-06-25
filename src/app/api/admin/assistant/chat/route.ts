import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { askHankServer } from '@/lib/hank/server';
import type { AssistantChatAction } from '@/lib/assistant/types';

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

  // Pull live context so the assistant can answer from memory + open work.
  const [contextRes, tasksRes] = await Promise.all([
    admin
      .from('assistant_context')
      .select('subject, info')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(40),
    admin
      .from('assistant_tasks')
      .select('title, priority, status')
      .or(`owner_id.eq.${user.id},created_by.eq.${user.id}`)
      .neq('status', 'done')
      .limit(40),
  ]);

  const contextTxt = (contextRes.data ?? []).length
    ? (contextRes.data ?? []).map((c) => `- ${c.subject}: ${c.info}`).join('\n')
    : '(none yet)';
  const tasksTxt = (tasksRes.data ?? []).length
    ? (tasksRes.data ?? []).map((t) => `- [${t.priority}] ${t.title} (${t.status})`).join('\n')
    : '(none)';

  const systemPrompt = `You are ${displayName}'s personal work assistant inside the Candid admin portal (technology & payments advisory). You help manage tasks and remember context about people and businesses.

## Things you remember
${contextTxt}

## Open tasks
${tasksTxt}

## How to respond
Respond with ONLY a JSON object (no markdown, no code fences):
{ "message": "your conversational reply", "actions": [ ...optional ] }

Available actions:
1. {"type":"add_task","title":"...","priority":"low|normal|high|urgent"}  — create a task for the user
2. {"type":"remember","subject":"Person or Company","info":"the fact to remember"}  — save context to memory

Use add_task when the user asks to create/track something. Use remember when the user shares a durable fact about a person, company, or preference. Keep "message" concise and friendly. Respond ONLY with valid JSON.`;

  let raw: string;
  try {
    raw = await askHankServer(
      messages.map((m) => ({ role: m.role, content: m.content })),
      { systemPrompt, maxTokens: 1200 },
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
        });
        applied.push(action);
      }
    } catch {
      /* skip failed action */
    }
  }

  return NextResponse.json({ message: parsed.message, actions: applied });
}
