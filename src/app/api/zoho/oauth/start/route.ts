import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getMyRole } from '@/lib/auth/roles';
import { buildAuthorizeUrl, isZohoConfigured } from '@/lib/email/zoho';

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

  // CSRF protection: random nonce kept in an httpOnly cookie and echoed in state.
  const nonce = randomBytes(16).toString('hex');
  const state = Buffer.from(JSON.stringify({ nonce, shared })).toString('base64url');

  const response = NextResponse.redirect(buildAuthorizeUrl(state));
  response.cookies.set('zoho_oauth_nonce', nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return response;
}
