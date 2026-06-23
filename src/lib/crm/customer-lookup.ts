import type { Customer } from '@/components/CustomersView';
import type { BillAnalysisReviewRow } from '@/lib/bill-parse-types';
import { formatCategoriesLabel } from '@/lib/provider-categories';

function normalizeEmail(email?: string | null): string {
  return email?.trim().toLowerCase() ?? '';
}

export function findCustomerByContactEmail(
  customers: Customer[],
  email?: string | null,
): Customer | undefined {
  const needle = normalizeEmail(email);
  if (!needle) return undefined;
  return customers.find((customer) =>
    customer.contacts.some((contact) => normalizeEmail(contact.email) === needle),
  );
}

export function customerContactEmails(customer: Customer): Set<string> {
  const emails = new Set<string>();
  for (const contact of customer.contacts) {
    const email = normalizeEmail(contact.email);
    if (email) emails.add(email);
  }
  return emails;
}

export function analysisReviewsForCustomer(
  reviews: BillAnalysisReviewRow[],
  customer: Customer,
): BillAnalysisReviewRow[] {
  const emails = customerContactEmails(customer);
  if (!emails.size) return [];
  return reviews
    .filter((review) => emails.has(normalizeEmail(review.customer_email)))
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
