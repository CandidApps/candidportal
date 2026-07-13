import type { QuoteCustomerAcceptance } from '@/lib/quotes/quote-acceptance';
import type { ContractSubmitActionRow } from '@/lib/services/contract-submit-actions';
import { CONTRACT_DEAL_STAGE_LABEL } from '@/lib/services/contract-submit-actions';
import type { PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';
import {
  formatQuotePackageForEmail,
  resolveQuotePackage,
} from '@/lib/quotes/quote-package-summary';

export function buildContractSubmitEmailSubject(action: ContractSubmitActionRow): string {
  const customer =
    action.account_name?.trim() || action.customer_name?.trim() || 'Customer';
  const vendor = action.vendor_name?.trim() || action.service_label;
  return `Contract request — ${customer} / ${vendor}`;
}

export function buildContractSubmitEmailBody(
  action: ContractSubmitActionRow,
  opts?: {
    paySource?: string | null;
    includePaysourceCcNote?: boolean;
    snapshot?: PublishedAnalysisSnapshot | null;
  },
): string {
  const a = action.acceptance;
  const account =
    action.account_name?.trim() || action.customer_name?.trim() || '—';
  const contact =
    action.customer_name?.trim() &&
    action.account_name?.trim() &&
    action.customer_name.trim().toLowerCase() !== action.account_name.trim().toLowerCase()
      ? action.customer_name.trim()
      : action.acceptance?.contactName?.trim() || null;

  const lines: string[] = [
    'Hello,',
    '',
    'Please prepare a contract for the following accepted quote:',
    '',
    `Customer: ${account}`,
  ];
  if (contact) lines.push(`Contact: ${contact}`);
  lines.push(`Contact email: ${action.customer_email ?? '—'}`);
  lines.push(`Service: ${action.service_label}`);

  if (action.vendor_name) lines.push(`Vendor / solution: ${action.vendor_name}`);
  if (opts?.paySource) lines.push(`Pay source: ${opts.paySource}`);

  const pkg = resolveQuotePackage({
    acceptance: a,
    snapshot: opts?.snapshot ?? null,
    vendorName: action.vendor_name,
    serviceLabel: action.service_label,
  });

  if (pkg) {
    lines.push('', '—— Accepted quote package ——', ...formatQuotePackageForEmail(pkg));
  } else {
    if (a?.monthlyTotal != null) {
      lines.push(`Selected monthly: $${a.monthlyTotal.toFixed(2)}`);
    }
    if (a?.setupTotal != null) {
      lines.push(`Setup: $${a.setupTotal.toFixed(2)}`);
    }
    if (a?.annualSavings != null && a.annualSavings > 0) {
      lines.push(`Est. annual savings: $${a.annualSavings.toFixed(2)}`);
    }
  }

  if (action.details?.trim()) {
    lines.push('', 'Customer notes:', action.details.trim());
  }

  if (opts?.includePaysourceCcNote && opts.paySource) {
    lines.push(
      '',
      `CC: ${opts.paySource} (pay source) — please include them once the contract is ready for signature.`,
    );
  }

  lines.push(
    '',
    'Thank you,',
    'Candid Solutions',
    '',
    `Deal stage: ${CONTRACT_DEAL_STAGE_LABEL[action.status]}`,
  );

  return lines.join('\n');
}

export function buildCustomerContractEmailSubject(action: ContractSubmitActionRow): string {
  return `Your ${action.service_label} contract is ready to sign`;
}

export function buildCustomerContractEmailBody(
  action: ContractSubmitActionRow,
  opts?: { snapshot?: PublishedAnalysisSnapshot | null },
): string {
  const lines: string[] = [
    `Hi ${action.customer_name?.split(' ')[0] || 'there'},`,
    '',
    `Your ${action.service_label} contract is ready for signature.`,
  ];

  if (action.contract_url) {
    lines.push('', `Sign / view here: ${action.contract_url}`);
  } else if (action.contract_filename) {
    lines.push('', `Contract file: ${action.contract_filename}`);
  }

  const pkg = resolveQuotePackage({
    acceptance: action.acceptance,
    snapshot: opts?.snapshot ?? null,
    vendorName: action.vendor_name,
    serviceLabel: action.service_label,
  });
  if (pkg) {
    lines.push('', 'Quote summary:', ...formatQuotePackageForEmail(pkg).slice(0, 20));
  } else if (action.acceptance?.monthlyTotal != null) {
    lines.push('', `Selected monthly: $${action.acceptance.monthlyTotal.toFixed(2)}`);
  }

  lines.push('', 'Please reply once signed, or let us know if you have questions.', '', '— Candid Solutions');
  return lines.join('\n');
}

export function buildSupplierReplyEmailSubject(action: ContractSubmitActionRow): string {
  const account =
    action.account_name?.trim() || action.customer_name?.trim() || 'Customer';
  const vendor = action.vendor_name?.trim() || action.service_label;
  return `Re: Contract request — ${account} / ${vendor}`;
}

export function buildSupplierReplyEmailBody(action: ContractSubmitActionRow): string {
  const account =
    action.account_name?.trim() || action.customer_name?.trim() || 'the customer';
  const lines: string[] = [
    'Hello,',
    '',
    `Following up on the contract for ${account} (${action.service_label}).`,
    '',
  ];

  if (action.contract_url) {
    lines.push(`Contract currently on file: ${action.contract_url}`, '');
  } else if (action.contract_filename) {
    lines.push(`Contract file on file: ${action.contract_filename}`, '');
  }

  lines.push(
    'We need a change before we send this to the customer for signature:',
    '',
    '• ',
    '',
    'Thank you,',
    'Candid Solutions',
  );
  return lines.join('\n');
}

export function summarizeAcceptanceLines(acceptance: QuoteCustomerAcceptance | null): string {
  if (!acceptance?.lines?.length) return '';
  return acceptance.lines
    .filter((l) => (l.quantity ?? 0) > 0 || (l.flat && l.unitPrice !== 0))
    .slice(0, 12)
    .map((l) => l.name || 'Line')
    .join(', ');
}
