import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getMessageContent, searchConversation } from '@/lib/email/zoho';
import { resolveActiveMailbox } from '@/lib/email/zoho-connections';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const email = url.searchParams.get('email')?.trim();
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });

  const wantContent = url.searchParams.get('messageId');
  const folderId = url.searchParams.get('folderId');

  const mailbox = await resolveActiveMailbox(user.id, 'personal_first');
  if (!mailbox.ok) {
    return NextResponse.json({
      connected: false,
      messages: [],
      warning: mailbox.message,
    });
  }
  const connection = mailbox.connection;

  try {
    if (wantContent && folderId) {
      try {
        const content = await getMessageContent({
          accessToken: connection.accessToken,
          accountId: connection.accountId,
          folderId,
          messageId: wantContent,
        });
        return NextResponse.json({ connected: true, content });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not load message';
        console.warn('[email/conversation] content', message);
        return NextResponse.json({ connected: true, content: '', warning: message });
      }
    }

    const messages = await searchConversation({
      accessToken: connection.accessToken,
      accountId: connection.accountId,
      email,
      limit: 50,
    });
    return NextResponse.json({ connected: true, mailbox: connection.email, messages });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load conversation';
    console.warn('[email/conversation]', message);
    return NextResponse.json({
      connected: true,
      mailbox: connection.email,
      messages: [],
      warning: message,
    });
  }
}
