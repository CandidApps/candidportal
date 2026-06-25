import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { sendMail } from '@/lib/email/zoho';
import {
  getActiveConnectionForUser,
  getActiveSharedConnection,
} from '@/lib/email/zoho-connections';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as {
    to?: string;
    cc?: string;
    bcc?: string;
    subject?: string;
    html?: string;
    text?: string;
  };

  const to = body.to?.trim();
  if (!to) return NextResponse.json({ error: 'Missing recipient' }, { status: 400 });
  const subject = body.subject?.trim() || '(no subject)';
  const content = body.html ?? body.text ?? '';
  const mailFormat = body.html ? 'html' : 'plaintext';

  // Prefer sending as the logged-in teammate; fall back to the shared mailbox.
  const connection =
    (await getActiveConnectionForUser(user.id)) ?? (await getActiveSharedConnection());
  if (!connection) {
    return NextResponse.json(
      { error: 'No Zoho mailbox connected. Connect your mailbox from the account menu.' },
      { status: 409 },
    );
  }

  try {
    await sendMail({
      accessToken: connection.accessToken,
      accountId: connection.accountId,
      fromAddress: connection.email,
      toAddress: to,
      ccAddress: body.cc?.trim() || undefined,
      bccAddress: body.bcc?.trim() || undefined,
      subject,
      content,
      mailFormat,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Send failed' },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, sentFrom: connection.email });
}
