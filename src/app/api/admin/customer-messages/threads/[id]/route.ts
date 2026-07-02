import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { deliverMemberNotification } from '@/lib/notifications/member-notification-deliver';
import { memberEmailGreeting } from '@/lib/notifications/member-notification-email';

type ReplyBody = {
  body: string;
  notifyMember?: boolean;
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();

  const { data: thread, error: threadErr } = await admin
    .from('customer_message_threads')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (threadErr) return NextResponse.json({ error: threadErr.message }, { status: 500 });
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: messages, error: msgErr } = await admin
    .from('customer_messages')
    .select('*')
    .eq('thread_id', id)
    .order('created_at', { ascending: true });

  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

  return NextResponse.json({ thread, messages: messages ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  let body: ReplyBody;
  try {
    body = (await request.json()) as ReplyBody;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const text = body.body?.trim();
  if (!text) return NextResponse.json({ error: 'body required' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: thread, error: threadErr } = await admin
    .from('customer_message_threads')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (threadErr) return NextResponse.json({ error: threadErr.message }, { status: 500 });
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const now = new Date().toISOString();
  const userId = thread.user_id as string;

  const { data: message, error: insertErr } = await admin
    .from('customer_messages')
    .insert({
      thread_id: id,
      user_id: userId,
      author: 'team',
      body: text,
      attachments: [],
      created_at: now,
    })
    .select('*')
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  await admin.from('customer_message_threads').update({ updated_at: now, status: 'open' }).eq('id', id);

  if (body.notifyMember !== false) {
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('id', userId)
      .maybeSingle();

    const customerName = (profile?.full_name as string | null) ?? 'there';
    const customerEmail = (profile?.email as string | null) ?? '';
    const subject = (thread.subject as string | null) ?? 'Message from Candid';

    await deliverMemberNotification({
      userId,
      email: customerEmail,
      preferenceKey: 'ticket_responses',
      inApp: {
        type: 'message_center_reply',
        title: `New message — ${subject}`,
        body: text.length > 160 ? `${text.slice(0, 157)}…` : text,
        quote_request_id: (thread.quote_request_id as string | null) ?? null,
      },
      emailContent: {
        subject: `New message from Candid — ${subject}`,
        html: [
          `<p>${memberEmailGreeting(customerName)}</p>`,
          `<p>${text.replace(/\n/g, '<br/>')}</p>`,
          `<p>Sign in to your Candid portal Message Center to reply.</p>`,
          `<p>— Candid</p>`,
        ].join(''),
      },
    });
  }

  return NextResponse.json({ message });
}
