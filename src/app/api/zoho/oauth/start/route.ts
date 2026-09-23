import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { buildAuthorizeUrl, isZohoConfigured, zohoOAuthRedirectUri } from '@/lib/email/zoho';
import {
  canManageSharedMailbox,
  getSharedMailboxStatus,
} from '@/lib/email/zoho-connections';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isZohoConfigured()) {
    return NextResponse.json({ error: 'Zoho is not configured on the server.' }, { status: 500 });
  }

  const url = new URL(request.url);
  const shared = url.searchParams.get('shared') === '1';
  const returnTo = url.searchParams.get('return')?.trim() || '';

  if (shared) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const status = await getSharedMailboxStatus();
    const allowed = canManageSharedMailbox({
      viewerUserId: user.id,
      viewerEmail: user.email,
      connectedByUserId: status?.connectedByUserId ?? null,
      sharedExists: Boolean(status),
    });
    if (!allowed) {
      return NextResponse.json(
        { error: 'Only the teammate who manages the shared mailbox can reconnect it.' },
        { status: 403 },
      );
    }
  }

  // CSRF protection: random nonce kept in an httpOnly cookie and echoed in state.
  const nonce = randomBytes(16).toString('hex');
  const state = Buffer.from(JSON.stringify({ nonce, shared, returnTo })).toString('base64url');

  const response = NextResponse.redirect(buildAuthorizeUrl(state, zohoOAuthRedirectUri(request)));
  response.cookies.set('zoho_oauth_nonce', nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return response;
}
