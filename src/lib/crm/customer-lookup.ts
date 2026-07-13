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
