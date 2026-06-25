import { sendMail } from '@/lib/email/zoho';
import { getActiveSharedConnection } from '@/lib/email/zoho-connections';

/** Sends a customer reminder notification via the shared Zoho mailbox. */
export async function queueCustomerReminderEmail(params: {
  email: string;
  customerName: string;
  title: string;
  body?: string;
  kind: 'task' | 'reminder' | 'calendar';
  whenLabel?: string;
}): Promise<void> {
  if (!params.email) {
    console.info('[customer-reminder-email] No email — skipped', params.title);
    return;
  }

  const shared = await getActiveSharedConnection().catch(() => null);
  if (!shared) {
    console.info(
      '[customer-reminder-email] No shared Zoho mailbox connected. Would notify:',
      params.email,
      params.title,
    );
    return;
  }

  const content = [
    `<p>Hi ${params.customerName || 'there'},</p>`,
    `<p>${params.title}</p>`,
    params.whenLabel ? `<p><strong>When:</strong> ${params.whenLabel}</p>` : '',
    params.body ? `<p>${params.body}</p>` : '',
    `<p>— Candid</p>`,
  ]
    .filter(Boolean)
    .join('');

  try {
    await sendMail({
      accessToken: shared.accessToken,
      accountId: shared.accountId,
      fromAddress: shared.email,
      toAddress: params.email,
      subject: params.title,
      content,
      mailFormat: 'html',
    });
  } catch (err) {
    console.error('[customer-reminder-email] Send failed', err);
  }
}
