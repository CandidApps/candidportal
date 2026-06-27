import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { exchangeCodeForTokens, getPrimaryAccount, ZOHO_SCOPES } from '@/lib/email/zoho';
import { saveConnection } from '@/lib/email/zoho-connections';

export const dynamic = 'force-dynamic';

function redirectToApp(request: Request, status: 'connected' | 'error', message?: string) {
  // Return to /admin (not /) so the server re-reads the Supabase session and
  // renders the app — landing on / shows the login screen even when signed in.
  const base = new URL('/admin', request.url);
  base.searchParams.set('zoho', status);
  if (message) base.searchParams.set('zoho_msg', message);
  return NextResponse.redirect(base);
}

export async function GET(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return redirectToApp(request, 'error', 'Not authorized');
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  if (oauthError) {
    return redirectToApp(request, 'error', oauthError);
  }
  if (!code || !stateRaw) {
    return redirectToApp(request, 'error', 'Missing code or state');
  }

  // Verify CSRF nonce.
  let shared = false;
  try {
    const parsed = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf8')) as {
      nonce?: string;
      shared?: boolean;
    };
    const cookieStore = await cookies();
    const cookieNonce = cookieStore.get('zoho_oauth_nonce')?.value;
    if (!parsed.nonce || !cookieNonce || parsed.nonce !== cookieNonce) {
      return redirectToApp(request, 'error', 'Invalid OAuth state');
    }
    shared = Boolean(parsed.shared);
  } catch {
    return redirectToApp(request, 'error', 'Malformed OAuth state');
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirectToApp(request, 'error', 'No session');
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refreshToken) {
      // Zoho only returns a refresh token on first consent. prompt=consent forces it.
      return redirectToApp(request, 'error', 'No refresh token returned — revoke app access in Zoho and retry');
    }
    const account = await getPrimaryAccount(tokens.accessToken);
    await saveConnection({
      userId: user.id,
      accountId: account.accountId,
      email: account.email,
      displayName: account.displayName,
      refreshToken: tokens.refreshToken,
      scope: ZOHO_SCOPES,
      isShared: shared,
    });
  } catch (err) {
    return redirectToApp(request, 'error', err instanceof Error ? err.message : 'Connection failed');
  }

  const response = redirectToApp(request, 'connected');
  response.cookies.delete('zoho_oauth_nonce');
  return response;
}
