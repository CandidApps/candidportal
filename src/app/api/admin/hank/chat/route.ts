import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { askHankServer } from '@/lib/hank/server';
import {
  createHankDbToolRunner,
  HANK_DB_ACCESS_PROMPT,
  HANK_DB_TOOLS,
} from '@/lib/hank/db-query';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    messages?: { role: 'user' | 'assistant'; content: string }[];
    systemPrompt?: string;
    systemVolatile?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const messages = (body.messages ?? []).filter(
    (m) => (m.role === 'user' || m.role === 'assistant') && m.content?.trim(),
  );
  if (!messages.length) {
    return NextResponse.json({ error: 'messages required' }, { status: 400 });
  }

  const basePrompt = body.systemPrompt?.trim() ?? '';
  const systemPrompt = basePrompt
    ? `${basePrompt}\n\n${HANK_DB_ACCESS_PROMPT}`
    : HANK_DB_ACCESS_PROMPT;

  const admin = createSupabaseAdminClient();
  const runTool = createHankDbToolRunner(admin);

  try {
    const text = await askHankServer(messages, {
      systemPrompt,
      systemVolatile: body.systemVolatile?.trim() || null,
      maxTokens: 2000,
      routeLabel: 'admin-hank-chat',
      userId: user.id,
      tools: [...HANK_DB_TOOLS],
      runTool,
      maxToolIterations: 8,
    });
    return NextResponse.json({
      text:
        text ||
        "I'm having a moment. Even I have them occasionally — usually when staring at a Comcast invoice. Try again in a second.",
    });
  } catch (e) {
    console.error('admin hank chat error:', e);
    const message = e instanceof Error ? e.message : 'Request failed';
    if (/ANTHROPIC_API_KEY/.test(message)) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
