import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getActiveSharedConnection } from '@/lib/email/zoho-connections';
import { sendMail } from '@/lib/email/zoho';

const PORTAL_INVITE_FROM = 'support@candid.solutions';

function portalInviteFromAddress(sharedEmail: string | null | undefined): string {
  const preferred = process.env.PORTAL_INVITE_FROM?.trim() || PORTAL_INVITE_FROM;
  if (sharedEmail?.trim() && sharedEmail.trim().toLowerCase() === preferred.toLowerCase()) {
    return sharedEmail.trim();
  }
  return preferred;
}

function portalSignInEmailHtml(actionLink: string, companyHint?: string): string {
  const intro = companyHint
    ? `You’ve been invited to the Candid portal for <strong>${companyHint}</strong>.`
    : 'You’ve been invited to the Candid portal.';
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111;max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:15px">${intro}</p>
<p>Click below to sign in — no password required.</p>
<p><a href="${actionLink}" style="display:inline-block;padding:12px 20px;background:#C8281E;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Open your portal</a></p>
<p style="font-size:13px;color:#555">Or copy this link:<br><a href="${actionLink}">${actionLink}</a></p>
<p style="font-size:13px;color:#555">This link expires soon. If it stops working, ask your Candid contact to send a new invite.</p>
<p style="font-size:12px;color:#888;margin-top:24px">Candid Solutions · candid.solutions</p>
</body></html>`;
}

async function deliverPortalSignInLink(
  email: string,
  actionLink: string,
  companyHint?: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const shared = await getActiveSharedConnection().catch(() => null);
  if (!shared) {
    return {
      ok: false,
      message:
        'No shared Zoho mailbox connected. Mark a mailbox as shared under Admin → Zoho connection.',
    };
  }

  const subject = companyHint
    ? `Sign in to your Candid portal — ${companyHint}`
    : 'Sign in to your Candid portal';
  const html = portalSignInEmailHtml(actionLink, companyHint);
  const fromAddress = portalInviteFromAddress(shared.email);

  try {
    await sendMail({
      accessToken: shared.accessToken,
      accountId: shared.accountId,
      fromAddress,
      toAddress: email,
      subject,
      content: html,
      mailFormat: 'html',
    });
    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Zoho send failed';
    return {
      ok: false,
      message: `Could not send invite email via Zoho (${detail}). Ensure the shared mailbox can send as ${fromAddress}.`,
    };
  }
}

async function generatePortalActionLink(
  email: string,
  redirectTo: string,
): Promise<{ link: string } | { error: string }> {
  const admin = createSupabaseAdminClient();

  for (const type of ['magiclink', 'invite'] as const) {
    const { data, error } = await admin.auth.admin.generateLink({
      type,
      email,
      options: { redirectTo },
    });
    if (!error && data?.properties?.action_link) {
      return { link: data.properties.action_link };
    }
  }

  return { error: 'Could not generate a sign-in link for this email.' };
}

/**
 * Send a cross-device magic link for portal invites via the shared Zoho mailbox.
 * Client-side signInWithOtp stores PKCE state in the admin browser, so invitees
 * land on login when they open the link — admin.generateLink avoids that.
 */
export async function sendServerPortalMagicLink(
  email: string,
  redirectTo: string,
  opts?: { companyName?: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return { ok: false, message: 'Email is required.' };
  }

  const generated = await generatePortalActionLink(normalized, redirectTo);
  if ('error' in generated) {
    return { ok: false, message: generated.error };
  }

  return deliverPortalSignInLink(normalized, generated.link, opts?.companyName?.trim() || undefined);
}
