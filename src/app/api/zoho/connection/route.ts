import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  deleteConnection,
  getActiveConnectionForUser,
  getConnectionForUser,
  getSharedMailboxStatus,
} from '@/lib/email/zoho-connections';
import { isZohoConfigured } from '@/lib/email/zoho';

export const dynamic = 'force-dynamic';

async function currentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const connection = await getConnectionForUser(userId);
  let active = false;
  if (connection) {
    try {
      active = Boolean(await getActiveConnectionForUser(userId));
    } catch {
      active = false;
    }
  }

  const shared = await getSharedMailboxStatus();

  return NextResponse.json({
    configured: isZohoConfigured(),
    connection: connection
      ? {
          email: connection.email,
          displayName: connection.displayName,
          isShared: false,
          connectedAt: connection.connectedAt,
          active,
        }
      : null,
    sharedConfigured: Boolean(shared),
  });
}

export async function DELETE() {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Personal disconnect only — never deletes the shared singleton.
  await deleteConnection(userId);
  return NextResponse.json({ ok: true });
}
