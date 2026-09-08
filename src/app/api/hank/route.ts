import { NextResponse } from 'next/server';
import { HANK_SYSTEM_PROMPT } from '@/lib/candid-data';
import { askHankServer } from '@/lib/hank/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  createHankSourceFetchToolRunner,
  HANK_SUPPLIER_SOURCE_PROMPT,
  HANK_SUPPLIER_SOURCE_TOOLS,
} from '@/lib/hank/fetch-supplier-source';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type HankMessage = { role: string; content: string };

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { messages?: HankMessage[]; systemPrompt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const systemPrompt = [
    typeof body.systemPrompt === 'string' && body.systemPrompt.trim()
      ? body.systemPrompt.trim()
      : HANK_SYSTEM_PROMPT,
    HANK_SUPPLIER_SOURCE_PROMPT,
  ]
    .filter(Boolean)
    .join('\n\n');

  const raw = body.messages ?? [];
  const messages = raw
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: String(m.content ?? ''),
    }))
    .filter((m) => m.content.length > 0);

  if (messages.length === 0) {
    return NextResponse.json({ error: 'messages required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const runTool = createHankSourceFetchToolRunner(admin, { portalOnly: true });

  try {
    const text = await askHankServer(messages, {
      systemPrompt,
      maxTokens: 2000,
      routeLabel: 'hank',
      userId: user.id,
      tools: [...HANK_SUPPLIER_SOURCE_TOOLS],
      runTool,
      maxToolIterations: 8,
    });
    return NextResponse.json({
      text:
        text ||
        "I'm having a moment. Even I have them occasionally — usually when staring at a Comcast invoice. Try again in a second.",
    });
  } catch (e) {
    console.error('Hank route error:', e);
    const message = e instanceof Error ? e.message : 'Request failed';
    if (/ANTHROPIC_API_KEY/.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}
