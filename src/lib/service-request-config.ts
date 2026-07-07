export type ServiceRequestCategory =
  | 'bill_increase'
  | 'contract_renewal'
  | 'update_payment'
  | 'review_services'
  | 'support_ticket'
  | 'other';

export type ServiceRequestCategoryMeta = {
  id: ServiceRequestCategory;
  label: string;
  description: string;
  detailPrompt: string;
  escalates: 'review' | 'ticket';
  selfServiceFirst?: boolean;
};

export const SERVICE_REQUEST_CATEGORIES: ServiceRequestCategoryMeta[] = [
  {
    id: 'bill_increase',
    label: 'Review a recent bill or unexpected increase',
    description: 'Flag a charge you did not expect or ask us to review a statement.',
    detailPrompt: 'What changed on your bill, and when did you notice it?',
    escalates: 'review',
  },
  {
    id: 'contract_renewal',
    label: 'Discuss contract renewal',
    description: 'Renewal timing, terms, or whether to renegotiate or switch.',
    detailPrompt: 'When does your contract renew, and what would you like help deciding?',
    escalates: 'review',
  },
  {
    id: 'update_payment',
    label: 'Update payment or credit card info',
    description: 'Change the card on file or update billing details with your supplier.',
    detailPrompt: 'What payment method do you need to update, and for which service?',
    escalates: 'ticket',
    selfServiceFirst: true,
  },
  {
    id: 'review_services',
    label: 'Review my current services',
    description: 'Ask Candid to review savings, contracts, or whether you still need a service.',
    detailPrompt: 'Which service should we review, and what outcome are you looking for?',
    escalates: 'review',
  },
  {
    id: 'support_ticket',
    label: 'Open a support ticket',
    description: 'Billing issue, outage, account change, or anything else you need our team on.',
    detailPrompt: 'Describe the issue and what you need from Candid.',
    escalates: 'ticket',
  },
  {
    id: 'other',
    label: 'Something else',
    description: 'Any other question or request for the Candid team.',
    detailPrompt: 'How can we help?',
    escalates: 'ticket',
  },
];

export function serviceRequestCategoryMeta(
  id: ServiceRequestCategory,
): ServiceRequestCategoryMeta {
  return (
    SERVICE_REQUEST_CATEGORIES.find((c) => c.id === id) ??
    SERVICE_REQUEST_CATEGORIES[SERVICE_REQUEST_CATEGORIES.length - 1]
  );
}

export function serviceRequestSubject(
  category: ServiceRequestCategory,
  serviceName: string,
): string {
  switch (category) {
    case 'bill_increase':
      return `Bill review — ${serviceName}`;
    case 'contract_renewal':
      return `Contract renewal — ${serviceName}`;
    case 'update_payment':
      return `Payment update — ${serviceName}`;
    case 'review_services':
      return `Service review — ${serviceName}`;
    case 'support_ticket':
      return `Support — ${serviceName}`;
    default:
      return `Request — ${serviceName}`;
  }
}

export const REVIEW_ESCALATION_CATEGORIES = new Set<ServiceRequestCategory>([
  'bill_increase',
  'contract_renewal',
  'review_services',
]);
