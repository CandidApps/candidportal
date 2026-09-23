import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  canManageSharedMailbox,
  deleteSharedConnection,
  getSharedMailboxStatus,
  listTeamMailboxes,
} from '@/lib/email/zoho-connections';
import { isZohoConfigured } from '@/lib/email/zoho';

export const dynamic = 'force-dynamic';

const PORTAL_INVITE_FROM =
  process.env.PORTAL_INVITE_FROM?.trim() || 'support@candid.solutions';

async function currentUser(): Promise<{ id: string; email: string | null } | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? null };
}

export async function GET() {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const zohoConfigured = isZohoConfigured();
  const shared = zohoConfigured ? await getSharedMailboxStatus() : null;
  const teamMailboxes = zohoConfigured ? await listTeamMailboxes(user.id) : [];
  const canManage = canManageSharedMailbox({
    viewerUserId: user.id,
    viewerEmail: user.email,
    connectedByUserId: shared?.connectedByUserId ?? null,
    sharedExists: Boolean(shared),
  });

  return NextResponse.json({
    zohoConfigured,
    inviteFrom: PORTAL_INVITE_FROM,
    shared,
    canManageShared: canManage,
    teamMailboxes,
  });
}

export async function DELETE() {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const shared = await getSharedMailboxStatus();
  const canManage = canManageSharedMailbox({
    viewerUserId: user.id,
    viewerEmail: user.email,
    connectedByUserId: shared?.connectedByUserId ?? null,
    sharedExists: Boolean(shared),
  });
  if (!canManage) {
    return NextResponse.json(
      { error: 'Only the teammate who connected the shared mailbox can disconnect it.' },
      { status: 403 },
    );
  }

  const removed = await deleteSharedConnection();
  if (!removed) {
    return NextResponse.json({ error: 'No shared mailbox connected' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
