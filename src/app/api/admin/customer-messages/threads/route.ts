import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import {
  filesFromFormData,
  uploadCustomerMessageAttachments,
} from '@/lib/customer-message-attachments';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { deliverMemberNotification } from '@/lib/notifications/member-notification-deliver';
import { memberEmailGreeting } from '@/lib/notifications/member-notification-email';

export const dynamic = 'force-dynamic';

type CreateBody = {
  email?: string;
  userId?: string;
  subject?: string;
  body?: string;
  category?: string;
  notifyMember?: boolean;
};

/** Start a new conversation with a portal customer (by profile email or user id). */
export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  let email = '';
  let userId = '';
  let subjectIn = '';
  let text = '';
  let category = 'general';
  let notifyMember = true;
  let files: File[] = [];

  if (contentType.includes('multipart/form-data')) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid form' }, { status: 400 });
    }
    email = String(form.get('email') ?? '').trim();
    userId = String(form.get('userId') ?? '').trim();
    subjectIn = String(form.get('subject') ?? '').trim();
    text = String(form.get('body') ?? '').trim();
    category = String(form.get('category') ?? 'general').trim() || 'general';
    notifyMember = String(form.get('notifyMember') ?? 'true') !== 'false';
    files = filesFromFormData(form);
  } else {
    let body: CreateBody;
    try {
      body = (await request.json()) as CreateBody;
    } catch {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    email = body.email?.trim() ?? '';
    userId = body.userId?.trim() ?? '';
    subjectIn = body.subject?.trim() ?? '';
    text = body.body?.trim() ?? '';
    category = body.category?.trim() || 'general';
    notifyMember = body.notifyMember !== false;
  }

  if (!text && files.length === 0) {
    return NextResponse.json({ error: 'body or files required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  let profile: { id: string; display_name: string | null; email: string | null } | null = null;

  if (userId) {
    const { data } = await admin
      .from('profiles')
      .select('id, display_name, email')
      .eq('id', userId)
      .maybeSingle();
    profile = data;
  } else {
    if (!email) {
      return NextResponse.json({ error: 'email or userId required' }, { status: 400 });
    }
    const { data } = await admin
      .from('profiles')
      .select('id, display_name, email')
      .ilike('email', email)
      .maybeSingle();
    profile = data;
    userId = data?.id ? String(data.id) : '';
  }

  if (!profile || !userId) {
    return NextResponse.json(
      {
        error:
          'No portal account found for that email. The customer needs portal access before you can message them.',
      },
      { status: 404 },
    );
  }

  const now = new Date().toISOString();
  const subject =
    subjectIn ||
    `Message from Candid — ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  const attachments = await uploadCustomerMessageAttachments(admin, userId, files);
  const messageBody = text || (attachments.length ? '(Attachment)' : '');

  const { data: thread, error: threadErr } = await admin
    .from('customer_message_threads')
    .insert({
      user_id: userId,
      subject,
      category,
      status: 'open',
      critical: false,
      created_at: now,
      updated_at: now,
      admin_read_at: now,
    })
    .select('*')
    .single();

  if (threadErr) {
    if (/admin_read_at/.test(threadErr.message)) {
      const fallback = await admin
        .from('customer_message_threads')
        .insert({
          user_id: userId,
          subject,
          category,
          status: 'open',
          critical: false,
          created_at: now,
          updated_at: now,
        })
        .select('*')
        .single();
      if (fallback.error || !fallback.data) {
        return NextResponse.json({ error: threadErr.message }, { status: 500 });
      }
      const threadId = String(fallback.data.id);
      const { error: msgErr } = await admin.from('customer_messages').insert({
        thread_id: threadId,
        user_id: userId,
        author: 'team',
        body: messageBody,
        attachments,
        created_at: now,
      });
      if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });
      if (notifyMember) {
        await notifyNewThread({
          userId,
          email: profile.email ?? '',
          name: profile.display_name ?? 'there',
          subject,
          text: messageBody,
          attachmentCount: attachments.length,
        });
      }
      return NextResponse.json({ threadId, thread: fallback.data });
    }
    return NextResponse.json({ error: threadErr.message }, { status: 500 });
  }

  const threadId = String(thread.id);
  const { error: msgErr } = await admin.from('customer_messages').insert({
    thread_id: threadId,
    user_id: userId,
    author: 'team',
    body: messageBody,
    attachments,
    created_at: now,
  });
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

  if (notifyMember) {
    await notifyNewThread({
      userId,
      email: profile.email ?? '',
      name: profile.display_name ?? 'there',
      subject,
      text: messageBody,
      attachmentCount: attachments.length,
    });
  }

  return NextResponse.json({ threadId, thread });
}

async function notifyNewThread(input: {
  userId: string;
  email: string;
  name: string;
  subject: string;
  text: string;
  attachmentCount?: number;
}) {
  const attachNote =
    input.attachmentCount && input.attachmentCount > 0
      ? `<p>${input.attachmentCount} file${input.attachmentCount === 1 ? '' : 's'} attached — view in your portal Message Center.</p>`
      : '';
  await deliverMemberNotification({
    userId: input.userId,
    email: input.email,
    preferenceKey: 'ticket_responses',
    inApp: {
      type: 'message_center_reply',
      title: `New message — ${input.subject}`,
      body: input.text.length > 160 ? `${input.text.slice(0, 157)}…` : input.text,
      quote_request_id: null,
    },
    emailContent: {
      subject: `New message from Candid — ${input.subject}`,
      html: [
        `<p>${memberEmailGreeting(input.name)}</p>`,
        `<p>${input.text.replace(/\n/g, '<br/>')}</p>`,
        attachNote,
        `<p>Sign in to your Candid portal Message Center to reply.</p>`,
        `<p>— Candid</p>`,
      ].join(''),
    },
  });
}

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
      .select('id, display_name, email')
      .in('id', userIds);
    for (const p of profiles ?? []) {
      profileByUser.set(String(p.id), {
        name: (p.display_name as string | null) ?? 'Customer',
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
