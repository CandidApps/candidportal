import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getMessageContent, searchConversation } from '@/lib/email/zoho';
import {
  getActiveConnectionForUser,
  getActiveSharedConnection,
} from '@/lib/email/zoho-connections';

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

  // Read from the teammate's own mailbox; fall back to shared if not connected.
  const connection =
    (await getActiveConnectionForUser(user.id)) ?? (await getActiveSharedConnection());
  if (!connection) {
    return NextResponse.json({ connected: false, messages: [] });
  }

  try {
    // Fetch full content for a single message when requested.
    if (wantContent && folderId) {
      const content = await getMessageContent({
        accessToken: connection.accessToken,
        accountId: connection.accountId,
        folderId,
        messageId: wantContent,
      });
      return NextResponse.json({ connected: true, content });
    }

    const messages = await searchConversation({
      accessToken: connection.accessToken,
      accountId: connection.accountId,
      email,
      limit: 50,
    });
    return NextResponse.json({ connected: true, mailbox: connection.email, messages });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not load conversation' },
      { status: 502 },
    );
  }
}
