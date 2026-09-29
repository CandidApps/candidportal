import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { isCandidAdminEmail } from '@/lib/auth/admin-email';
import {
  buildZohoSignInUrl,
  parseSignInReturn,
  ZOHO_SIGNIN_COOKIE,
  zohoSignInRedirectUri,
  type ZohoSignInCookie,
} from '@/lib/auth/zoho-signin';
import { isZohoConfigured } from '@/lib/email/zoho';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = parseSignInReturn(url.searchParams.get('return'));
  const email = url.searchParams.get('email')?.trim().toLowerCase() ?? '';

  const fail = (message: string) => {
    const target = new URL(returnTo, request.url);
    target.searchParams.set(returnTo === '/login' ? 'error' : 'login_error', message);
    return NextResponse.redirect(target);
  };

  if (!isCandidAdminEmail(email)) {
    return fail('Zoho sign-in is only available for @candid.solutions accounts.');
  }
  if (!isZohoConfigured()) {
    return fail('Zoho sign-in is not configured on the server.');
  }

  const nonce = randomBytes(16).toString('hex');
  const cookie: ZohoSignInCookie = { nonce, email, returnTo };
  const response = NextResponse.redirect(buildZohoSignInUrl(nonce, zohoSignInRedirectUri(request), email));
  response.cookies.set(ZOHO_SIGNIN_COOKIE, Buffer.from(JSON.stringify(cookie)).toString('base64url'), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return response;
}
