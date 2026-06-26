import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadActions, loadCalendar, loadEmailAndRecaps, loadMentions } from '@/lib/assistant/data';
import type { AssistantOverview } from '@/lib/assistant/types';

export const dynamic = 'force-dynamic';

async function currentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
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

export async function GET() {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const calendar = await loadCalendar(userId);
  const [emailResult, actions, mentions] = await Promise.all([
    loadEmailAndRecaps(userId, calendar.events),
    loadActions(),
    loadMentions(userId),
  ]);

  const overview: AssistantOverview = {
    calendar,
    email: emailResult.email,
    recaps: emailResult.recaps,
    actions,
    mentions,
    counts: {
      actions: actions.length,
      mentions: mentions.length,
      eventsToday: calendar.events.filter((e) => isToday(e.start)).length,
      emails: emailResult.email.needsAction.length,
    },
  };

  return NextResponse.json(overview);
}
