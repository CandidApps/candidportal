import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isSmtpConfigured, sendEmail } from '@/lib/email/mailer';
import { getActiveSharedConnection } from '@/lib/email/zoho-connections';
import { sendMail } from '@/lib/email/zoho';

function portalSignInEmailHtml(actionLink: string, companyHint?: string): string {
  const intro = companyHint
    ? `You’ve been invited to the Candid portal for <strong>${companyHint}</strong>.`
    : 'You’ve been invited to the Candid portal.';
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
<p>${intro}</p>
<p><a href="${actionLink}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Open your portal</a></p>
<p style="font-size:13px;color:#555">Or copy this link:<br><a href="${actionLink}">${actionLink}</a></p>
<p style="font-size:13px;color:#555">This link expires soon. If it stops working, ask your Candid contact to send a new invite.</p>
</body></html>`;
}

async function deliverPortalSignInLink(
  email: string,
  actionLink: string,
  companyHint?: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const subject = companyHint
    ? `Sign in to your Candid portal — ${companyHint}`
    : 'Sign in to your Candid portal';
  const text = `Open your Candid portal: ${actionLink}`;
  const html = portalSignInEmailHtml(actionLink, companyHint);

  if (isSmtpConfigured()) {
    await sendEmail({ to: email, subject, html, text });
    return { ok: true };
  }

  const shared = await getActiveSharedConnection().catch(() => null);
  if (shared) {
    await sendMail({
      accessToken: shared.accessToken,
      accountId: shared.accountId,
      fromAddress: shared.email,
      toAddress: email,
      subject,
      content: html,
      mailFormat: 'html',
    });
    return { ok: true };
  }

  return {
    ok: false,
    message:
      'Could not send invite email (configure Mailtrap SMTP or a shared Zoho mailbox).',
  };
}

/**
 * Send a cross-device magic link for portal invites.
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

  const admin = createSupabaseAdminClient();
  const companyHint = opts?.companyName?.trim() || undefined;

  const magic = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: normalized,
    options: { redirectTo },
  });

  if (!magic.error && magic.data?.properties?.action_link) {
    return deliverPortalSignInLink(
      normalized,
      magic.data.properties.action_link,
      companyHint,
    );
  }

  const invite = await admin.auth.admin.inviteUserByEmail(normalized, {
    redirectTo,
  });
  if (!invite.error) {
    return { ok: true };
  }

  const inviteLink = await admin.auth.admin.generateLink({
    type: 'invite',
    email: normalized,
    options: { redirectTo },
  });
  if (!inviteLink.error && inviteLink.data?.properties?.action_link) {
    return deliverPortalSignInLink(
      normalized,
      inviteLink.data.properties.action_link,
      companyHint,
    );
  }

  const detail =
    magic.error?.message ||
    invite.error?.message ||
    inviteLink.error?.message ||
    'Could not generate a sign-in link.';
  return { ok: false, message: detail };
}
