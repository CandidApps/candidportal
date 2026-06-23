export type RegistryEntityType = 'commission_partner' | 'solution_provider';

export type CommissionPartnerDocumentType =
  | 'partner_agreement'
  | 'schedule_a'
  | 'product_pricing'
  | 'addendum'
  | 'w9'
  | 'ach_authorization'
  | 'nda'
  | 'commission_schedule'
  | 'other';

export type SolutionProviderDocumentType =
  | 'vendor_agreement'
  | 'schedule_a'
  | 'product_pricing'
  | 'rate_sheet'
  | 'addendum'
  | 'w9'
  | 'nda'
  | 'other';

export type RegistryDocumentType = CommissionPartnerDocumentType | SolutionProviderDocumentType;

export const COMMISSION_PARTNER_DOCUMENT_OPTIONS: {
  value: CommissionPartnerDocumentType;
  label: string;
}[] = [
  { value: 'partner_agreement', label: 'Partner agreement' },
  { value: 'schedule_a', label: 'Schedule A' },
  { value: 'product_pricing', label: 'Product pricing' },
  { value: 'commission_schedule', label: 'Commission schedule' },
  { value: 'addendum', label: 'Addendum' },
  { value: 'w9', label: 'W-9' },
  { value: 'ach_authorization', label: 'ACH authorization' },
  { value: 'nda', label: 'NDA' },
  { value: 'other', label: 'Other' },
];

export const SOLUTION_PROVIDER_DOCUMENT_OPTIONS: {
  value: SolutionProviderDocumentType;
  label: string;
}[] = [
  { value: 'vendor_agreement', label: 'Vendor agreement' },
  { value: 'schedule_a', label: 'Schedule A' },
  { value: 'product_pricing', label: 'Product pricing' },
  { value: 'rate_sheet', label: 'Rate sheet' },
  { value: 'addendum', label: 'Addendum' },
  { value: 'w9', label: 'W-9' },
  { value: 'nda', label: 'NDA' },
  { value: 'other', label: 'Other' },
];

export type RegistryDocument = {
  id: string;
  entityType: RegistryEntityType;
  entityKey: string;
  documentType: RegistryDocumentType;
  filename: string;
  storagePath: string;
  uploadedBy: string;
  signedDate?: string;
  notes?: string;
  fileSizeLabel: string;
  createdAt: string;
};

export function registryDocumentTypeLabel(
  entityType: RegistryEntityType,
  type: RegistryDocumentType,
): string {
  const options =
    entityType === 'commission_partner'
      ? COMMISSION_PARTNER_DOCUMENT_OPTIONS
      : SOLUTION_PROVIDER_DOCUMENT_OPTIONS;
  return options.find((o) => o.value === type)?.label ?? type;
}

export function formatRegistryFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function guessRegistryDocumentType(
  entityType: RegistryEntityType,
  filename: string,
): RegistryDocumentType {
  const name = filename.toLowerCase();
  if (/w-?9|w9/.test(name)) return 'w9';
  if (/schedule\s*a|sched\s*a/.test(name)) return 'schedule_a';
  if (/pricing|price\s*list|rate\s*card/.test(name)) return 'product_pricing';
  if (/rate\s*sheet|commission\s*rates/.test(name)) return 'rate_sheet';
  if (/addendum|amendment/.test(name)) return 'addendum';
  if (/ach|direct\s*deposit/.test(name)) return 'ach_authorization';
  if (/nda|non-?disclosure/.test(name)) return 'nda';
  if (/commission\s*schedule/.test(name)) return 'commission_schedule';
  if (entityType === 'commission_partner') {
    if (/partner|master\s*agent|referral|agreement|msa/.test(name)) return 'partner_agreement';
    return 'other';
  }
  if (/vendor|supplier|agreement|msa/.test(name)) return 'vendor_agreement';
  return 'other';
}

export function documentOptionsForEntity(entityType: RegistryEntityType) {
  return entityType === 'commission_partner'
    ? COMMISSION_PARTNER_DOCUMENT_OPTIONS
    : SOLUTION_PROVIDER_DOCUMENT_OPTIONS;
}

export function defaultDocumentType(entityType: RegistryEntityType): RegistryDocumentType {
  return entityType === 'commission_partner' ? 'partner_agreement' : 'vendor_agreement';
}
