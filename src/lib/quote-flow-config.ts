import type { SolutionCategoryId } from '@/lib/solutions/catalog';

export type QuoteFlowFieldType = 'text' | 'number' | 'select' | 'date' | 'textarea' | 'boolean';

export type QuoteFlowField = {
  id: string;
  label: string;
  type: QuoteFlowFieldType;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  hint?: string;
};

export type QuoteServiceType = {
  id: string;
  label: string;
  categoryId?: SolutionCategoryId;
  questions: QuoteFlowField[];
};

/** Service-specific question sets — kept minimal but enough for a real quote request. */
export const QUOTE_SERVICE_TYPES: QuoteServiceType[] = [
  {
    id: 'internet',
    label: 'Internet / Broadband',
    categoryId: 'connectivity',
    questions: [
      { id: 'deviceCount', label: 'How many devices need connectivity?', type: 'number', required: true, placeholder: 'e.g. 25' },
      {
        id: 'connectionType',
        label: 'Connection type desired',
        type: 'select',
        required: true,
        options: [
          { value: 'fiber', label: 'Fiber' },
          { value: 'coax', label: 'Coax / Cable' },
          { value: 'fixed_wireless', label: 'Fixed wireless / 5G' },
          { value: 'unsure', label: 'Not sure — recommend for me' },
        ],
      },
      {
        id: 'budgetRange',
        label: 'Budget range (monthly)',
        type: 'select',
        options: [
          { value: 'under_200', label: 'Under $200/mo' },
          { value: '200_500', label: '$200–$500/mo' },
          { value: '500_1000', label: '$500–$1,000/mo' },
          { value: 'over_1000', label: 'Over $1,000/mo' },
        ],
      },
      { id: 'serviceStartDate', label: 'Desired service start date', type: 'date' },
      { id: 'equipmentNeeds', label: 'Equipment needs', type: 'text', placeholder: 'Router, Wi‑Fi, firewall, etc.' },
      {
        id: 'backupConnection',
        label: 'Do you require a backup connection if primary internet goes down?',
        type: 'boolean',
        required: true,
      },
      { id: 'currentProvider', label: 'Current provider (if any)', type: 'text', placeholder: 'e.g. Comcast Business' },
    ],
  },
  {
    id: 'ucaas',
    label: 'UCaaS / Phone System',
    categoryId: 'ucaas',
    questions: [
      { id: 'userCount', label: 'How many users / seats?', type: 'number', required: true },
      { id: 'phoneCount', label: 'How many phone numbers / lines?', type: 'number' },
      {
        id: 'features',
        label: 'Must-have features',
        type: 'textarea',
        placeholder: 'SMS, call recording, contact center, mobile app…',
      },
      { id: 'currentProvider', label: 'Current provider', type: 'text', placeholder: 'RingCentral, Vonage, etc.' },
      { id: 'serviceStartDate', label: 'Target go-live date', type: 'date' },
    ],
  },
  {
    id: 'merchant',
    label: 'Merchant Processing',
    categoryId: 'payments',
    questions: [
      { id: 'monthlyVolume', label: 'Approx. monthly card volume ($)', type: 'number', required: true },
      { id: 'avgTicket', label: 'Average ticket size ($)', type: 'number' },
      { id: 'mccOrIndustry', label: 'Industry / business type', type: 'text', required: true },
      { id: 'currentProvider', label: 'Current processor', type: 'text' },
      { id: 'equipmentNeeds', label: 'Terminal / POS needs', type: 'text' },
    ],
  },
  {
    id: 'cloud',
    label: 'Microsoft 365 / Google Workspace',
    categoryId: 'cloud',
    questions: [
      { id: 'userCount', label: 'Number of users', type: 'number', required: true },
      {
        id: 'platform',
        label: 'Platform',
        type: 'select',
        required: true,
        options: [
          { value: 'm365', label: 'Microsoft 365' },
          { value: 'google', label: 'Google Workspace' },
          { value: 'both', label: 'Evaluating both' },
        ],
      },
      { id: 'currentProvider', label: 'Current setup', type: 'text' },
    ],
  },
  {
    id: 'security',
    label: 'Cybersecurity',
    categoryId: 'security',
    questions: [
      { id: 'userCount', label: 'Users / endpoints to protect', type: 'number', required: true },
      {
        id: 'priorities',
        label: 'Top priorities',
        type: 'textarea',
        placeholder: 'EDR, email security, compliance, SIEM…',
      },
      { id: 'currentProvider', label: 'Current tools (if any)', type: 'text' },
    ],
  },
  {
    id: 'other',
    label: 'Other service',
    categoryId: 'other',
    questions: [
      { id: 'description', label: 'What do you need?', type: 'textarea', required: true },
      { id: 'userCount', label: 'Users / locations / scale', type: 'text' },
      { id: 'currentProvider', label: 'Current provider (if any)', type: 'text' },
    ],
  },
];

export function quoteServiceById(id: string): QuoteServiceType | undefined {
  return QUOTE_SERVICE_TYPES.find((s) => s.id === id);
}

export function quoteServiceForCategory(categoryId: SolutionCategoryId): QuoteServiceType | undefined {
  return QUOTE_SERVICE_TYPES.find((s) => s.categoryId === categoryId);
}

/** Map a customer-facing service label (quote pills, services array) to a quote service type id. */
export function quoteServiceIdFromLabel(label: string): string | null {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return null;

  const exact = QUOTE_SERVICE_TYPES.find((t) => t.label.toLowerCase() === normalized);
  if (exact) return exact.id;

  const partial = QUOTE_SERVICE_TYPES.find(
    (t) =>
      normalized.includes(t.label.toLowerCase()) || t.label.toLowerCase().includes(normalized),
  );
  if (partial) return partial.id;

  const legacyPills: Record<string, string> = {
    'microsoft 365': 'cloud',
    'google workspace': 'cloud',
    'cloud / backup': 'cloud',
    'it managed services': 'other',
    'ccaas / contact center': 'ucaas',
    'iot / smart office': 'other',
  };
  return legacyPills[normalized] ?? null;
}

export type NewQuoteDraft = {
  contactName: string;
  company: string;
  email: string;
  phone: string;
  locationId: string;
  locationLabel: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  serviceTypeId: string;
  serviceAnswers: Record<string, string | boolean>;
  vendorNames: string[];
  additionalComments: string;
};

export function emptyQuoteDraft(prefill?: Partial<NewQuoteDraft>): NewQuoteDraft {
  return {
    contactName: prefill?.contactName ?? '',
    company: prefill?.company ?? '',
    email: prefill?.email ?? '',
    phone: prefill?.phone ?? '',
    locationId: prefill?.locationId ?? '',
    locationLabel: prefill?.locationLabel ?? '',
    street: prefill?.street ?? '',
    city: prefill?.city ?? '',
    state: prefill?.state ?? '',
    zip: prefill?.zip ?? '',
    serviceTypeId: prefill?.serviceTypeId ?? '',
    serviceAnswers: prefill?.serviceAnswers ?? {},
    vendorNames: prefill?.vendorNames ?? [],
    additionalComments: prefill?.additionalComments ?? '',
  };
}

export function summarizeQuoteAnswers(serviceTypeId: string, answers: Record<string, string | boolean>): string {
  const svc = quoteServiceById(serviceTypeId);
  if (!svc) return '';
  return svc.questions
    .map((q) => {
      const val = answers[q.id];
      if (val === undefined || val === '') return null;
      const display = typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val);
      return `${q.label}: ${display}`;
    })
    .filter(Boolean)
    .join('; ');
}
