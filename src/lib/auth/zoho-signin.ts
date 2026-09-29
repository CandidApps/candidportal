import 'server-only';

import { NextResponse } from 'next/server';
import { isCandidAdminEmail } from '@/lib/auth/admin-email';
import { zohoConfig, zohoOAuthRedirectUri } from '@/lib/email/zoho';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const ZOHO_SIGNIN_SCOPE = 'openid email profile ZohoMail.accounts.READ';
export const ZOHO_SIGNIN_COOKIE = 'zoho_signin';

export type ZohoSignInReturn = '/' | '/login';

export type ZohoSignInCookie = {
  nonce: string;
  email: string;
  returnTo: ZohoSignInReturn;
};

/** Shares the mailbox connection's registered callback; that route hands sign-ins off here. */
export function zohoSignInRedirectUri(request: Request): string {
  return zohoOAuthRedirectUri(request);
}

export function parseSignInReturn(value: string | null | undefined): ZohoSignInReturn {
  return value === '/login' ? '/login' : '/';
}

export function readZohoSignInCookie(raw: string | undefined): ZohoSignInCookie | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<ZohoSignInCookie>;
    if (!parsed.nonce || !parsed.email) return null;
    return { nonce: parsed.nonce, email: parsed.email, returnTo: parseSignInReturn(parsed.returnTo) };
  } catch {
    return null;
  }
}

export async function handleZohoSignInCallback(request: Request, pending: ZohoSignInCookie): Promise<NextResponse> {
  const url = new URL(request.url);

  const finish = (target: URL) => {
    const response = NextResponse.redirect(target);
    response.cookies.delete(ZOHO_SIGNIN_COOKIE);
    return response;
  };
  const fail = (message: string) => {
    const target = new URL(pending.returnTo, request.url);
    target.searchParams.set(pending.returnTo === '/login' ? 'error' : 'login_error', message);
    return finish(target);
  };

  const oauthError = url.searchParams.get('error');
  if (oauthError) {
    return fail(oauthError === 'access_denied' ? 'Zoho sign-in was cancelled.' : `Zoho sign-in failed (${oauthError}).`);
  }
  const code = url.searchParams.get('code');
  if (!code || url.searchParams.get('state') !== pending.nonce) {
    return fail('Zoho sign-in expired or was started in another browser. Try again.');
  }

  try {
    const { email, accessToken } = await verifiedZohoIdentity(code, zohoSignInRedirectUri(request));
    if (email !== pending.email) {
      const aliases = await zohoMailboxAddresses(accessToken, email);
      if (!aliases.includes(pending.email)) {
        return fail(
          `You signed in to Zoho as ${email}, and ${pending.email} is not one of its addresses. Use the matching Zoho account.`,
        );
      }
    }
    const tokenHash = await candidSignInTokenHash(pending.email);
    const target = new URL('/auth/callback', request.url);
    target.searchParams.set('token_hash', tokenHash);
    target.searchParams.set('type', 'magiclink');
    target.searchParams.set('next', '/admin');
    return finish(target);
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Zoho sign-in failed.');
  }
}

export function buildZohoSignInUrl(state: string, redirectUri: string, loginHint: string): string {
  const cfg = zohoConfig();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    scope: ZOHO_SIGNIN_SCOPE,
    redirect_uri: redirectUri,
    access_type: 'online',
    login_hint: loginHint,
    state,
  });
  return `${cfg.accountsDomain}/oauth/v2/auth?${params.toString()}`;
}

type IdTokenClaims = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  email?: string;
  email_verified?: boolean | string;
};

function decodeJwtPayload(token: string): IdTokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as IdTokenClaims;
  } catch {
    return null;
  }
}

/**
 * Exchanges the code server-side (client secret over TLS), so the ID token is
 * trusted from the token endpoint without separate signature verification.
 */
export async function verifiedZohoIdentity(
  code: string,
  redirectUri: string,
): Promise<{ email: string; accessToken: string }> {
  const cfg = zohoConfig();
  const res = await fetch(`${cfg.accountsDomain}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { id_token?: string; access_token?: string; error?: string };
  if (!res.ok || json.error || !json.id_token || !json.access_token) {
    throw new Error(`Zoho sign-in failed (${json.error ?? res.statusText}).`);
  }

  const claims = decodeJwtPayload(json.id_token);
  if (!claims) throw new Error('Zoho returned an unreadable sign-in token.');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(cfg.clientId)) throw new Error('Zoho sign-in token was issued for a different app.');
  if (!claims.iss || !/^https:\/\/accounts\.zoho\./.test(claims.iss)) {
    throw new Error('Zoho sign-in token has an unexpected issuer.');
  }
  if (claims.exp && claims.exp * 1000 < Date.now()) throw new Error('Zoho sign-in token expired. Try again.');
  const verified = claims.email_verified === true || claims.email_verified === 'true';
  const email = claims.email?.trim().toLowerCase() ?? '';
  if (!email || !verified) throw new Error('Your Zoho account email is not verified.');
  return { email, accessToken: json.access_token };
}

/**
 * The signed-in user's own Zoho Mail addresses (primary + aliases). Excludes
 * send-as / delegated addresses so shared mailboxes never count as a match.
 */
async function zohoMailboxAddresses(accessToken: string, identityEmail: string): Promise<string[]> {
  const cfg = zohoConfig();
  const res = await fetch(`${cfg.apiDomain}/api/accounts`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: 'application/json' },
  }).catch(() => null);
  if (!res?.ok) return [];
  const json = (await res.json().catch(() => ({}))) as { data?: Array<Record<string, unknown>> };
  const addresses = new Set<string>();
  for (const account of json.data ?? []) {
    const primary = account.primaryEmailAddress ?? account.mailboxAddress;
    if (typeof primary !== 'string' || primary.trim().toLowerCase() !== identityEmail) continue;
    if (!Array.isArray(account.emailAddress)) continue;
    for (const entry of account.emailAddress as Array<Record<string, unknown>>) {
      if (entry.isConfirmed === false) continue;
      if (typeof entry.mailId === 'string') addresses.add(entry.mailId.trim().toLowerCase());
    }
  }
  return [...addresses];
}

/**
 * Returns a one-time token hash for /auth/callback when the email is an existing
 * @candid.solutions portal user. Never creates users.
 */
export async function candidSignInTokenHash(email: string): Promise<string> {
  if (!isCandidAdminEmail(email)) {
    throw new Error('Zoho sign-in is only available for @candid.solutions accounts.');
  }
  const admin = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .ilike('email', email.replace(/[\\%_]/g, (ch) => `\\${ch}`))
    .maybeSingle();
  if (profileError) throw new Error('Could not look up your portal account.');
  if (!profile) throw new Error(`No portal account exists for ${email}. Ask an admin to add you.`);

  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const hashed = data?.properties?.hashed_token?.trim();
  if (error || !hashed) throw new Error('Could not start your portal session. Try again.');
  return hashed;
}
