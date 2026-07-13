export type ServiceRequestCategory =
  | 'bill_increase'
  | 'contract_renewal'
  | 'update_payment'
  | 'review_services'
  | 'additional_services'
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
    id: 'additional_services',
    label: 'Request additional services',
    description:
      'Add seats, extensions, or licenses to a service you already have (e.g. Vonage seats or Microsoft licenses).',
    detailPrompt: 'Tell us what to add, who it’s for, and when you need it.',
    escalates: 'ticket',
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
    SERVICE_REQUEST_CATEGORIES[SERVICE_REQUEST_CATEGORIES.length - 1]!
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
    case 'additional_services':
      return `Additional services — ${serviceName}`;
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

export type AdditionalServicesRequestDraft = {
  quantity: string;
  itemType: string;
  people: string;
  emails: string;
  neededBy: string;
  notes: string;
};

export function emptyAdditionalServicesDraft(): AdditionalServicesRequestDraft {
  return {
    quantity: '',
    itemType: '',
    people: '',
    emails: '',
    neededBy: '',
    notes: '',
  };
}

/** Format structured additional-services fields into the escalation message body. */
export function formatAdditionalServicesMessage(
  draft: AdditionalServicesRequestDraft,
  serviceName: string,
): string {
  const qty = draft.quantity.trim();
  const item = draft.itemType.trim() || 'seats / licenses / extensions';
  const lines = [
    `Additional services request for ${serviceName}`,
    `Quantity: ${qty || '—'} ${item}`,
    `People / names: ${draft.people.trim() || '—'}`,
    `Email addresses: ${draft.emails.trim() || '—'}`,
    `Needed by: ${draft.neededBy.trim() || '—'}`,
  ];
  if (draft.notes.trim()) {
    lines.push(`Notes: ${draft.notes.trim()}`);
  }
  return lines.join('\n');
}

export function additionalServicesDraftIsValid(draft: AdditionalServicesRequestDraft): string | null {
  if (!draft.quantity.trim() || Number(draft.quantity) <= 0) {
    return 'Enter how many seats, licenses, or extensions you need.';
  }
  if (!draft.itemType.trim()) {
    return 'Describe what you need (e.g. Vonage extensions, Microsoft Business licenses).';
  }
  if (!draft.people.trim()) {
    return 'List the people these seats/licenses are for.';
  }
  if (!draft.emails.trim()) {
    return 'Include email addresses for those people.';
  }
  if (!draft.neededBy.trim()) {
    return 'Tell us when you need this by.';
  }
  return null;
}
