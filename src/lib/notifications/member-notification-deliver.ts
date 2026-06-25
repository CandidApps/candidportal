import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { MemberEmailNotificationKey } from '@/lib/portal/notification-preferences';
import { sendMemberNotificationEmail } from '@/lib/notifications/member-notification-email';

export type DeliverMemberNotificationInput = {
  userId: string;
  email?: string | null;
  preferenceKey: MemberEmailNotificationKey;
  inApp?: {
    type: string;
    title: string;
    body: string;
    account_service_id?: string | null;
    analysis_review_id?: string | null;
    reminder_id?: string | null;
  };
  emailContent: {
    subject: string;
    html: string;
  };
  forceEmail?: boolean;
};

export async function deliverMemberNotification(
  input: DeliverMemberNotificationInput,
): Promise<{ inAppSent: boolean; emailSent: boolean }> {
  let inAppSent = false;
  const admin = createSupabaseAdminClient();

  if (input.inApp) {
    const { error } = await admin.from('member_notifications').insert({
      user_id: input.userId,
      type: input.inApp.type,
      title: input.inApp.title,
      body: input.inApp.body,
      account_service_id: input.inApp.account_service_id ?? null,
      analysis_review_id: input.inApp.analysis_review_id ?? null,
      reminder_id: input.inApp.reminder_id ?? null,
    });
    inAppSent = !error;
    if (error) {
      console.error('[member-deliver] in-app insert failed', error.message);
    }
  }

  const recipient = input.email?.trim();
  if (!recipient) {
    return { inAppSent, emailSent: false };
  }

  const emailSent = await sendMemberNotificationEmail({
    email: recipient,
    userId: input.userId,
    preferenceKey: input.preferenceKey,
    subject: input.emailContent.subject,
    html: input.emailContent.html,
    force: input.forceEmail,
  });

  return { inAppSent, emailSent };
}
