import type { Customer, Contact } from '@/components/CustomersView';
import type { BillAnalysisReviewRow } from '@/lib/bill-parse-types';
import { formatCategoriesLabel } from '@/lib/provider-categories';

function normalizeEmail(email?: string | null): string {
  return email?.trim().toLowerCase() ?? '';
}

/** All emails on a contact (primary + alt). */
export function contactEmailAddresses(contact: Pick<Contact, 'email' | 'altEmail'>): string[] {
  const out: string[] = [];
  const primary = normalizeEmail(contact.email);
  const alt = normalizeEmail(contact.altEmail);
  if (primary) out.push(primary);
  if (alt && alt !== primary) out.push(alt);
  return out;
}

function hostnameFromWebsite(website?: string | null): string | null {
  const raw = website?.trim();
  if (!raw) return null;
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const host = new URL(withProto).hostname.replace(/^www\./i, '').toLowerCase();
    return host || null;
  } catch {
    const cleaned = raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]?.trim().toLowerCase();
    return cleaned || null;
  }
}

/** Domains from primary/alt websites plus domains on contact emails. */
export function customerEmailDomains(customer: Customer): Set<string> {
  const domains = new Set<string>();
  for (const site of [customer.website, customer.altWebsite]) {
    const host = hostnameFromWebsite(site);
    if (host) domains.add(host);
  }
  for (const contact of customer.contacts) {
    for (const email of contactEmailAddresses(contact)) {
      const domain = email.split('@')[1];
      if (domain) domains.add(domain);
    }
  }
  return domains;
}

const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'mail.com',
  'gmx.com',
  'ymail.com',
]);

export function findCustomerByContactEmail(
  customers: Customer[],
  email?: string | null,
): Customer | undefined {
  const needle = normalizeEmail(email);
  if (!needle) return undefined;
  const byExact = customers.find((customer) =>
    customer.contacts.some((contact) => contactEmailAddresses(contact).includes(needle)),
  );
  if (byExact) return byExact;

  const domain = needle.split('@')[1];
  if (!domain || PUBLIC_EMAIL_DOMAINS.has(domain)) return undefined;
  // Fall back to matching the sender domain against account websites / alt website
  // or any known contact email domain on the account.
  return customers.find((customer) => customerEmailDomains(customer).has(domain));
}

export function customerContactEmails(customer: Customer): Set<string> {
  const emails = new Set<string>();
  for (const contact of customer.contacts) {
    for (const email of contactEmailAddresses(contact)) emails.add(email);
  }
  return emails;
}

/** Admin portal preview synthetic email: preview+{customerId}.{contactId}@candid.preview */
export function isAdminPreviewEmailForCustomer(
  email: string | null | undefined,
  customerId: string,
): boolean {
  const needle = normalizeEmail(email);
  if (!needle || !customerId) return false;
  return needle.startsWith(`preview+${customerId.toLowerCase()}.`) && needle.endsWith('@candid.preview');
}

export function analysisReviewsForCustomer(
  reviews: BillAnalysisReviewRow[],
  customer: Customer,
): BillAnalysisReviewRow[] {
  const emails = customerContactEmails(customer);
  return reviews
    .filter((review) => {
      if (review.crm_customer_id && review.crm_customer_id === customer.id) return true;
      if (isAdminPreviewEmailForCustomer(review.customer_email, customer.id)) return true;
      const email = normalizeEmail(review.customer_email);
      return Boolean(email && emails.has(email));
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function analysisReviewCategoriesLabel(review: BillAnalysisReviewRow): string {
  return formatCategoriesLabel(review.detected_categories ?? [review.detected_category]);
}

export function analysisReviewStatusLabel(status: BillAnalysisReviewRow['status']): string {
  switch (status) {
    case 'pending_review':
      return 'Pending review';
    case 'in_progress':
      return 'In progress';
    case 'published':
      return 'Published';
    case 'dismissed':
      return 'Dismissed';
    default:
      return status;
  }
}

export function analysisReviewActionId(id: string): string {
  return `analysis-review-${id}`;
}

/** Pending bill analyses for the account Actions banner (Needs attention). */
export function openAnalysisReviewsForCustomer(
  reviews: BillAnalysisReviewRow[],
  customer: Customer,
): BillAnalysisReviewRow[] {
  return analysisReviewsForCustomer(reviews, customer).filter(
    (r) => r.status === 'pending_review' || r.status === 'in_progress',
  );
}

export function analysisReviewToCustomerAction(review: BillAnalysisReviewRow): import('@/lib/portal-import/merge').CustomerAction {
  return {
    id: analysisReviewActionId(review.id),
    kind: 'custom',
    severity: 'urgent',
    title: `Bill analysis — ${review.vendor_name}`,
    detail: [
      review.category_label ?? review.detected_category,
      review.customer_name,
      review.status === 'in_progress' ? 'In progress' : 'Awaiting admin review',
    ]
      .filter(Boolean)
      .join(' · '),
    suggestedAction: 'Open the bill analysis review and publish savings for this account.',
    source: 'custom',
  };
}
