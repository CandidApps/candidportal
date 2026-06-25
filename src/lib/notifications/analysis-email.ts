import type { MemberEmailNotificationKey } from '@/lib/portal/notification-preferences';
import {
  memberEmailGreeting,
  sendMemberNotificationEmail,
} from '@/lib/notifications/member-notification-email';

/** Sends an analysis/statement published notification via the shared Zoho mailbox. */
export async function queueAnalysisPublishedEmail(params: {
  email: string;
  userId?: string | null;
  customerName: string;
  vendorName: string;
  preferenceKey?: MemberEmailNotificationKey;
}): Promise<void> {
  const preferenceKey = params.preferenceKey ?? 'analysis_complete';
  const subject =
    preferenceKey === 'statement_reviewed'
      ? `Your ${params.vendorName} statement review is complete`
      : preferenceKey === 'savings_opportunities'
        ? `New savings opportunity — ${params.vendorName}`
        : `Your ${params.vendorName} analysis is ready`;

  const bodyLine =
    preferenceKey === 'statement_reviewed'
      ? `We've finished reviewing your <strong>${params.vendorName}</strong> statement.`
      : preferenceKey === 'savings_opportunities'
        ? `We've identified a new savings opportunity for <strong>${params.vendorName}</strong>.`
        : `Your analysis for <strong>${params.vendorName}</strong> has been published and is ready to review in your Candid portal.`;

  await sendMemberNotificationEmail({
    email: params.email,
    userId: params.userId,
    preferenceKey,
    subject,
    html: [
      `<p>${memberEmailGreeting(params.customerName)}</p>`,
      `<p>${bodyLine}</p>`,
      `<p>Sign in to view your results and recommended next steps.</p>`,
      `<p>— Candid</p>`,
    ].join(''),
  });
}
