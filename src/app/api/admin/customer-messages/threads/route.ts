import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** Admin inbox: all customer message threads with latest message preview. */
export async function GET() {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: threads, error } = await admin
    .from('customer_message_threads')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const threadIds = (threads ?? []).map((t) => t.id as string);
  let messages: Record<string, unknown>[] = [];
  if (threadIds.length) {
    const { data: msgs } = await admin
      .from('customer_messages')
      .select('*')
      .in('thread_id', threadIds)
      .order('created_at', { ascending: false });
    messages = msgs ?? [];
  }

  const lastByThread = new Map<string, Record<string, unknown>>();
  for (const m of messages) {
    const tid = m.thread_id as string;
    if (!lastByThread.has(tid)) lastByThread.set(tid, m);
  }

  const enriched = (threads ?? []).map((t) => ({
    ...t,
    last_message: lastByThread.get(t.id as string) ?? null,
  }));

  const userIds = [...new Set((threads ?? []).map((t) => String(t.user_id)))];
  const profileByUser = new Map<string, { name: string; email: string }>();
  if (userIds.length) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds);
    for (const p of profiles ?? []) {
      profileByUser.set(String(p.id), {
        name: (p.full_name as string | null) ?? 'Customer',
        email: (p.email as string | null) ?? '',
      });
    }
  }

  const withCustomer = enriched.map((t) => {
    const profile = profileByUser.get(String(t.user_id));
    return {
      ...t,
      customer_name: profile?.name ?? 'Customer',
      customer_email: profile?.email ?? '',
    };
  });

  return NextResponse.json({ threads: withCustomer });
}
