import type { MemberEmailNotificationKey } from '@/lib/portal/notification-preferences';
import {
  memberEmailGreeting,
  sendMemberNotificationEmail,
} from '@/lib/notifications/member-notification-email';

/** Sends a customer reminder notification via the shared Zoho mailbox. */
export async function queueCustomerReminderEmail(params: {
  email: string;
  userId?: string | null;
  customerName: string;
  title: string;
  body?: string;
  kind: 'task' | 'reminder' | 'calendar';
  whenLabel?: string;
  preferenceKey: MemberEmailNotificationKey;
}): Promise<void> {
  const content = [
    `<p>${memberEmailGreeting(params.customerName)}</p>`,
    `<p>${params.title}</p>`,
    params.whenLabel ? `<p><strong>When:</strong> ${params.whenLabel}</p>` : '',
    params.body ? `<p>${params.body}</p>` : '',
    `<p>— Candid</p>`,
  ]
    .filter(Boolean)
    .join('');

  await sendMemberNotificationEmail({
    email: params.email,
    userId: params.userId,
    preferenceKey: params.preferenceKey,
    subject: params.title,
    html: content,
  });
}
