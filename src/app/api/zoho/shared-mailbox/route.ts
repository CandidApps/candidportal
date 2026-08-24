import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { isZohoConfigured } from '@/lib/email/zoho';
import { deleteSharedConnection, getSharedMailboxStatus } from '@/lib/email/zoho-connections';

export const dynamic = 'force-dynamic';

const PORTAL_INVITE_FROM =
  process.env.PORTAL_INVITE_FROM?.trim() || 'support@candid.solutions';

export async function GET() {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const zohoConfigured = isZohoConfigured();
  const shared = zohoConfigured ? await getSharedMailboxStatus() : null;

  return NextResponse.json({
    zohoConfigured,
    inviteFrom: PORTAL_INVITE_FROM,
    shared,
  });
}

export async function DELETE() {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const removed = await deleteSharedConnection();
  if (!removed) {
    return NextResponse.json({ error: 'No shared mailbox connected' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
