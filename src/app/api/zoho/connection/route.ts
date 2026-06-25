import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { deleteConnection, getConnectionForUser } from '@/lib/email/zoho-connections';
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

  // Is a shared system mailbox configured anywhere?
  const admin = createSupabaseAdminClient();
  const { count } = await admin
    .from('zoho_connections')
    .select('user_id', { count: 'exact', head: true })
    .eq('is_shared', true);

  return NextResponse.json({
    configured: isZohoConfigured(),
    connection: connection
      ? {
          email: connection.email,
          displayName: connection.displayName,
          isShared: connection.isShared,
          connectedAt: connection.connectedAt,
        }
      : null,
    sharedConfigured: (count ?? 0) > 0,
  });
}

export async function DELETE() {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await deleteConnection(userId);
  return NextResponse.json({ ok: true });
}
