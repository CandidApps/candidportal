import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadActions, loadCalendar, loadEmailAndRecaps, loadMentions } from '@/lib/assistant/data';
import { loadDialpadCalls, syncDialpadCalls, dialpadUserIdForEmail } from '@/lib/dialpad/sync';
import type { AssistantOverview } from '@/lib/assistant/types';

export const dynamic = 'force-dynamic';

async function currentUser(): Promise<{ id: string; email: string | null } | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', user.id)
    .maybeSingle();
  return { id: user.id, email: profile?.email ?? user.email ?? null };
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Best-effort refresh of the Dialpad log; never blocks the page on failure.
  await syncDialpadCalls(14).catch(() => undefined);

  const teamWide = new URL(request.url).searchParams.get('calls') === 'team';
  const dialpadUserId = teamWide ? null : await dialpadUserIdForEmail(user.email).catch(() => null);

  const calendar = await loadCalendar(user.id);
  const [emailResult, actions, mentions, callsResult] = await Promise.all([
    loadEmailAndRecaps(user.id, calendar.events),
    loadActions(),
    loadMentions(user.id),
    loadDialpadCalls(25, { userId: user.id, email: user.email, dialpadUserId }, { teamWide }),
  ]);

  const overview: AssistantOverview = {
    calendar,
    email: emailResult.email,
    recaps: emailResult.recaps,
    actions,
    mentions,
    calls: callsResult.calls,
    callsConnected: callsResult.connected,
    counts: {
      actions: actions.length,
      mentions: mentions.length,
      eventsToday: calendar.events.filter((e) => isToday(e.start)).length,
      emails: emailResult.email.needsAction.length,
      calls: callsResult.calls.length,
    },
  };

  return NextResponse.json(overview);
}
