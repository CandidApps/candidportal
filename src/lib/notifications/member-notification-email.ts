import { sendMail } from '@/lib/email/zoho';
import { getActiveSharedConnection } from '@/lib/email/zoho-connections';
import type { MemberEmailNotificationKey } from '@/lib/portal/notification-preferences';
import {
  getMemberNotificationPrefsByEmail,
  getMemberNotificationPrefsByUserId,
  isMemberEmailEnabled,
} from '@/lib/notifications/member-prefs';

export type SendMemberNotificationEmailInput = {
  email: string;
  userId?: string | null;
  preferenceKey: MemberEmailNotificationKey;
  subject: string;
  html: string;
  /** When true, send even if preference is off (admin one-off). */
  force?: boolean;
};

/** Sends a member email when their notification preference allows it. */
export async function sendMemberNotificationEmail(
  input: SendMemberNotificationEmailInput,
): Promise<boolean> {
  const email = input.email.trim();
  if (!email) {
    console.info(`[member-email:${input.preferenceKey}] No recipient — skipped`);
    return false;
  }

  let prefs;
  if (input.userId) {
    prefs = await getMemberNotificationPrefsByUserId(input.userId);
  }
  if (!prefs) {
    const resolved = await getMemberNotificationPrefsByEmail(email);
    prefs = resolved.preferences;
  }

  if (!input.force && !isMemberEmailEnabled(prefs, input.preferenceKey)) {
    console.info(`[member-email:${input.preferenceKey}] Disabled for`, email);
    return false;
  }

  const shared = await getActiveSharedConnection().catch(() => null);
  if (!shared) {
    console.info(
      `[member-email:${input.preferenceKey}] No shared Zoho mailbox. Would notify:`,
      email,
      input.subject,
    );
    return false;
  }

  try {
    await sendMail({
      accessToken: shared.accessToken,
      accountId: shared.accountId,
      fromAddress: shared.email,
      toAddress: email,
      subject: input.subject,
      content: input.html,
      mailFormat: 'html',
    });
    return true;
  } catch (err) {
    console.error(`[member-email:${input.preferenceKey}] Send failed`, err);
    return false;
  }
}

export function memberEmailGreeting(name?: string | null): string {
  return name?.trim() ? `Hi ${name.trim()},` : 'Hi there,';
}
