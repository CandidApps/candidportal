import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const BUCKET = 'service-bills';

export type MessageAttachment = { name: string; path: string; type: string };

export type CustomerMessage = {
  id: string;
  thread_id: string;
  author: 'customer' | 'ai' | 'team';
  body: string;
  attachments: MessageAttachment[];
  created_at: string;
};

export type CustomerMessageThread = {
  id: string;
  subject: string | null;
  category: string;
  status: string;
  critical: boolean;
  supplier_name: string | null;
  created_at: string;
  updated_at: string;
  messages: CustomerMessage[];
};

/** List the signed-in customer's message threads with their messages. */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: threads, error } = await supabase
    .from('customer_message_threads')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) {
    if (/customer_message_threads/.test(error.message)) return NextResponse.json({ threads: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (threads ?? []).map((t) => t.id);
  let messages: CustomerMessage[] = [];
  if (ids.length) {
    const { data: msgs } = await supabase
      .from('customer_messages')
      .select('*')
      .in('thread_id', ids)
      .order('created_at', { ascending: true });
    messages = (msgs ?? []) as CustomerMessage[];
  }

  const byThread = new Map<string, CustomerMessage[]>();
  for (const m of messages) {
    const arr = byThread.get(m.thread_id) ?? [];
    arr.push(m);
    byThread.set(m.thread_id, arr);
  }

  const out: CustomerMessageThread[] = (threads ?? []).map((t) => ({
    ...(t as Omit<CustomerMessageThread, 'messages'>),
    messages: byThread.get(t.id) ?? [],
  }));
  return NextResponse.json({ threads: out });
}

/** Create a thread (with first message) or append a message to an existing one.
 *  Accepts multipart/form-data so document attachments can be uploaded. */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const body = String(form.get('body') ?? '').trim();
  const author = (String(form.get('author') ?? 'customer') as CustomerMessage['author']);

  // Upload attachments (best-effort).
  const attachments: MessageAttachment[] = [];
  for (const entry of form.getAll('files')) {
    if (entry instanceof File && entry.size > 0) {
      const safe = entry.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `messages/${user.id}/${Date.now()}-${safe}`;
      const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(path, Buffer.from(await entry.arrayBuffer()), {
          contentType: entry.type || 'application/octet-stream',
        });
      if (!upErr) attachments.push({ name: entry.name, path, type: entry.type });
    }
  }

  let threadId = String(form.get('threadId') ?? '').trim();

  if (!threadId) {
    const { data: thread, error: tErr } = await admin
      .from('customer_message_threads')
      .insert({
        user_id: user.id,
        subject: String(form.get('subject') ?? '').trim() || (body.slice(0, 80) || 'New message'),
        category: String(form.get('category') ?? 'general'),
        status: 'open',
        critical: String(form.get('critical') ?? 'false') === 'true',
        supplier_name: String(form.get('supplierName') ?? '').trim() || null,
      })
      .select('id')
      .single();
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
    threadId = thread.id;
  } else {
    await admin
      .from('customer_message_threads')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', threadId)
      .eq('user_id', user.id);
  }

  const { error: mErr } = await admin.from('customer_messages').insert({
    thread_id: threadId,
    user_id: user.id,
    author,
    body,
    attachments,
  });
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, threadId, attachments });
}
