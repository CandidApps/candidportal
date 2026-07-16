import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import {
  enrichCustomerMessageAttachments,
  filesFromFormData,
  uploadCustomerMessageAttachments,
} from '@/lib/customer-message-attachments';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { deliverMemberNotification } from '@/lib/notifications/member-notification-deliver';
import { memberEmailGreeting } from '@/lib/notifications/member-notification-email';

type ReplyBody = {
  body: string;
  notifyMember?: boolean;
};

type PatchBody = {
  read?: boolean;
  archived?: boolean;
};

function isActiveStatus(status: string): boolean {
  return status !== 'closed' && status !== 'resolved' && status !== 'archived';
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const hasRead = typeof body.read === 'boolean';
  const hasArchived = typeof body.archived === 'boolean';
  if (!hasRead && !hasArchived) {
    return NextResponse.json({ error: 'read or archived required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  if (hasRead) patch.admin_read_at = body.read ? now : null;
  if (hasArchived) {
    patch.status = body.archived ? 'archived' : 'open';
    patch.updated_at = now;
    if (!body.archived) patch.admin_read_at = now;
  }

  const { data, error } = await admin
    .from('customer_message_threads')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) {
    if (/admin_read_at/.test(error.message)) {
      return NextResponse.json({ error: 'Apply migration 0058 first' }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ thread: data });
}

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

  const status = String(thread.status ?? 'open');
  const wasUnread = isActiveStatus(status) && !thread.admin_read_at;
  const previousReadAt = (thread.admin_read_at as string | null) ?? null;
  let activeThread = thread;
  if (wasUnread) {
    const now = new Date().toISOString();
    const { data: marked, error: markErr } = await admin
      .from('customer_message_threads')
      .update({ admin_read_at: now })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (!markErr && marked) {
      activeThread = marked;
    } else if (markErr && !/admin_read_at/.test(markErr.message)) {
      return NextResponse.json({ error: markErr.message }, { status: 500 });
    }
  }

  const { data: messages, error: msgErr } = await admin
    .from('customer_messages')
    .select('*')
    .eq('thread_id', id)
    .order('created_at', { ascending: true });

  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

  const rows = messages ?? [];
  const lastTeamAt = [...rows]
    .reverse()
    .find((m) => m.author === 'team')
    ?.created_at as string | undefined;

  const withFlags = enrichCustomerMessageAttachments(rows).map((m) => {
    const isCustomer = m.author === 'customer';
    let isNew = false;
    if (isCustomer && wasUnread) {
      if (previousReadAt) {
        isNew = String(m.created_at) > previousReadAt;
      } else if (lastTeamAt) {
        isNew = String(m.created_at) > lastTeamAt;
      } else {
        isNew = true;
      }
    }
    return { ...m, isNew };
  });

  return NextResponse.json({
    thread: activeThread,
    messages: withFlags,
    wasUnread,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const contentType = request.headers.get('content-type') ?? '';
  let text = '';
  let notifyMember = true;
  let files: File[] = [];

  if (contentType.includes('multipart/form-data')) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid form' }, { status: 400 });
    }
    text = String(form.get('body') ?? '').trim();
    notifyMember = String(form.get('notifyMember') ?? 'true') !== 'false';
    files = filesFromFormData(form);
  } else {
    let body: ReplyBody;
    try {
      body = (await request.json()) as ReplyBody;
    } catch {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    text = body.body?.trim() ?? '';
    notifyMember = body.notifyMember !== false;
  }

  if (!text && files.length === 0) {
    return NextResponse.json({ error: 'body or files required' }, { status: 400 });
  }

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
  const attachments = await uploadCustomerMessageAttachments(admin, userId, files);

  const { data: message, error: insertErr } = await admin
    .from('customer_messages')
    .insert({
      thread_id: id,
      user_id: userId,
      author: 'team',
      body: text || (attachments.length ? '(Attachment)' : ''),
      attachments,
      created_at: now,
    })
    .select('*')
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  const threadUpdate = { updated_at: now, status: 'open' as const, admin_read_at: now };
  const { error: threadUpdateErr } = await admin
    .from('customer_message_threads')
    .update(threadUpdate)
    .eq('id', id);
  if (threadUpdateErr && /admin_read_at/.test(threadUpdateErr.message)) {
    await admin
      .from('customer_message_threads')
      .update({ updated_at: now, status: 'open' })
      .eq('id', id);
  } else if (threadUpdateErr) {
    return NextResponse.json({ error: threadUpdateErr.message }, { status: 500 });
  }

  if (notifyMember) {
    const { data: profile } = await admin
      .from('profiles')
      .select('display_name, email')
      .eq('id', userId)
      .maybeSingle();

    const customerName = (profile?.display_name as string | null) ?? 'there';
    const customerEmail = (profile?.email as string | null) ?? '';
    const subject = (thread.subject as string | null) ?? 'Message from Candid';
    const preview =
      text ||
      (attachments.length === 1
        ? `Sent an attachment: ${attachments[0]!.name}`
        : `Sent ${attachments.length} attachments`);

    await deliverMemberNotification({
      userId,
      email: customerEmail,
      preferenceKey: 'ticket_responses',
      inApp: {
        type: 'message_center_reply',
        title: `New message — ${subject}`,
        body: preview.length > 160 ? `${preview.slice(0, 157)}…` : preview,
        quote_request_id: (thread.quote_request_id as string | null) ?? null,
      },
      emailContent: {
        subject: `New message from Candid — ${subject}`,
        html: [
          `<p>${memberEmailGreeting(customerName)}</p>`,
          `<p>${preview.replace(/\n/g, '<br/>')}</p>`,
          attachments.length
            ? `<p>${attachments.length} file${attachments.length === 1 ? '' : 's'} attached — view in your portal Message Center.</p>`
            : '',
          `<p>Sign in to your Candid portal Message Center to reply.</p>`,
          `<p>— Candid</p>`,
        ].join(''),
      },
    });
  }

  const [enriched] = enrichCustomerMessageAttachments([message]);
  return NextResponse.json({ message: enriched });
}
