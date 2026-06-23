/** Email delivery stub — wire to Resend/SendGrid when configured. */
export async function queueAnalysisPublishedEmail(params: {
  email: string;
  customerName: string;
  vendorName: string;
}): Promise<void> {
  if (!params.email) {
    console.info('[analysis-email] No customer email — skipped', params.vendorName);
    return;
  }

  if (!process.env.RESEND_API_KEY && !process.env.SENDGRID_API_KEY) {
    console.info(
      '[analysis-email] Email not configured (set RESEND_API_KEY or SENDGRID_API_KEY). Would notify:',
      params.email,
      params.vendorName,
    );
    return;
  }

  // TODO: integrate transactional email provider
  console.info('[analysis-email] Queued notification to', params.email, 'for', params.vendorName);
}
