import { sendMail } from '@/lib/email/zoho';
import { getActiveSharedConnection } from '@/lib/email/zoho-connections';

/** Sends an "analysis published" notification via the shared Zoho mailbox. */
export async function queueAnalysisPublishedEmail(params: {
  email: string;
  customerName: string;
  vendorName: string;
}): Promise<void> {
  if (!params.email) {
    console.info('[analysis-email] No customer email — skipped', params.vendorName);
    return;
  }

  const shared = await getActiveSharedConnection().catch(() => null);
  if (!shared) {
    console.info(
      '[analysis-email] No shared Zoho mailbox connected. Would notify:',
      params.email,
      params.vendorName,
    );
    return;
  }

  const subject = `Your ${params.vendorName} analysis is ready`;
  const content = [
    `<p>Hi ${params.customerName || 'there'},</p>`,
    `<p>Your analysis for <strong>${params.vendorName}</strong> has been published and is ready to review in your Candid portal.</p>`,
    `<p>Sign in to view your results and recommended next steps.</p>`,
    `<p>— Candid</p>`,
  ].join('');

  try {
    await sendMail({
      accessToken: shared.accessToken,
      accountId: shared.accountId,
      fromAddress: shared.email,
      toAddress: params.email,
      subject,
      content,
      mailFormat: 'html',
    });
  } catch (err) {
    console.error('[analysis-email] Send failed', err);
  }
}
