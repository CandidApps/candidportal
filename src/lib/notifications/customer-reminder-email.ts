/** Email delivery stub for customer reminders — wire to Resend/SendGrid when configured. */
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

  if (!process.env.RESEND_API_KEY && !process.env.SENDGRID_API_KEY) {
    console.info(
      '[customer-reminder-email] Email not configured. Would notify:',
      params.email,
      params.title,
    );
    return;
  }

  console.info('[customer-reminder-email] Queued notification to', params.email, '—', params.title);
}
