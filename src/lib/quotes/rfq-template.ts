import type { QuoteRequestRow } from '@/lib/services/quote-requests';
import { formatQuoteRequestAnswers, resolveQuoteServiceLabel } from '@/lib/services/quote-requests';

export type RfqEmailOptions = {
  includeCustomerContact?: boolean;
};

export function buildRfqEmailSubject(row: QuoteRequestRow): string {
  const serviceLabel = resolveQuoteServiceLabel(row);
  const company = row.company?.trim();
  return company
    ? `Quote request — ${serviceLabel} — ${company}`
    : `Quote request — ${serviceLabel}`;
}

export function buildRfqEmailBody(row: QuoteRequestRow, options: RfqEmailOptions = {}): string {
  const lines: string[] = [
    'Hello,',
    '',
    'We have a new quote request from a Candid customer. Please review the details below and reply with pricing at your earliest convenience.',
    '',
    `Service: ${resolveQuoteServiceLabel(row)}`,
  ];

  if (row.location?.city || row.location?.street) {
    lines.push(
      `Location: ${[row.location.label, row.location.street, row.location.city, row.location.state, row.location.zip]
        .filter(Boolean)
        .join(', ')}`,
    );
  }

  if (row.vendor_names?.length) {
    lines.push(`Requested vendors: ${row.vendor_names.join(', ')}`);
  }

  const answers = formatQuoteRequestAnswers(row);
  if (answers.length) {
    lines.push('', 'Request details:');
    for (const a of answers) {
      lines.push(`• ${a.label}: ${a.value}`);
    }
  }

  if (row.note?.trim()) {
    lines.push('', `Additional notes: ${row.note.trim()}`);
  }

  if (options.includeCustomerContact !== false) {
    lines.push('', 'Customer contact (for follow-up):');
    if (row.company?.trim()) lines.push(`Company: ${row.company.trim()}`);
    if (row.contact_name?.trim()) lines.push(`Contact: ${row.contact_name.trim()}`);
    if (row.contact_email?.trim()) lines.push(`Email: ${row.contact_email.trim()}`);
    if (row.contact_phone?.trim()) lines.push(`Phone: ${row.contact_phone.trim()}`);
  }

  lines.push('', 'Thank you,', 'Candid Team');
  return lines.join('\n');
}
