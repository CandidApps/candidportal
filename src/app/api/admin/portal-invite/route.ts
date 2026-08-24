import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { sendServerPortalMagicLink } from '@/lib/auth/server-magic-link';
import { portalInvitesEnabled } from '@/lib/portal-invites';

function inviteRedirectUrl(request: Request): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  const fallback = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.candidiq.app';
  const origin = host ? `${proto}://${host}` : fallback;
  return `${origin}/auth/callback?next=${encodeURIComponent('/app')}`;
}

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!portalInvitesEnabled()) {
    return NextResponse.json(
      { ok: false, sent: false, message: 'Portal invite emails are disabled in this environment.' },
      { status: 400 },
    );
  }

  let body: { email?: string; companyName?: string };
  try {
    body = (await request.json()) as { email?: string; companyName?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = body.email?.trim();
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const result = await sendServerPortalMagicLink(email, inviteRedirectUrl(request), {
    companyName: body.companyName,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, sent: false, message: result.message }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    sent: true,
    message: `Magic link sent to ${email}. They can sign in without a password.`,
  });
}
