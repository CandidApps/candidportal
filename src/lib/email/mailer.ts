import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Mailtrap SMTP sender for all outbound transactional + admin email.
 *
 * Configured via environment variables:
 *   MAILTRAP_HOST   e.g. live.smtp.mailtrap.io   (sandbox: sandbox.smtp.mailtrap.io)
 *   MAILTRAP_PORT   587 (STARTTLS) or 465 (SSL)
 *   MAILTRAP_USER   SMTP username from Mailtrap
 *   MAILTRAP_PASS   SMTP password from Mailtrap
 *   MAILTRAP_FROM   verified sending address (default support@candidiq.app)
 */

let transporter: Transporter | null = null;

const DEFAULT_FROM = 'support@candidiq.app';

export function getSmtpFromAddress(): string {
  return process.env.MAILTRAP_FROM?.trim() || DEFAULT_FROM;
}

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.MAILTRAP_HOST && process.env.MAILTRAP_USER && process.env.MAILTRAP_PASS,
  );
}

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const host = process.env.MAILTRAP_HOST;
  const user = process.env.MAILTRAP_USER;
  const pass = process.env.MAILTRAP_PASS;
  if (!host || !user || !pass) {
    throw new Error('Mailtrap SMTP is not configured (MAILTRAP_HOST/USER/PASS).');
  }
  const port = Number(process.env.MAILTRAP_PORT ?? 587);
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return transporter;
}

export type SendEmailInput = {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html?: string;
  text?: string;
  /** Display name shown alongside the verified From address. */
  fromName?: string;
  /** Where recipient replies should be routed (e.g. the teammate's mailbox). */
  replyTo?: string;
};

/** Sends an email through Mailtrap SMTP. Throws if not configured or on failure. */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const t = getTransporter();
  const fromAddress = getSmtpFromAddress();
  const from = input.fromName
    ? `${input.fromName.replace(/[\r\n]/g, ' ')} <${fromAddress}>`
    : fromAddress;

  await t.sendMail({
    from,
    to: input.to,
    cc: input.cc || undefined,
    bcc: input.bcc || undefined,
    replyTo: input.replyTo || undefined,
    subject: input.subject,
    html: input.html,
    text: input.text ?? (input.html ? undefined : ''),
  });
}
