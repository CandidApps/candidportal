export type SupplierSource = {
  id: string;
  providerId: string;
  providerDbId?: number;
  providerName: string;
  title: string;
  url: string;
  sourceType: string;
  visibleInPortal: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

/** Seed suggestions for the source type combobox; real options merge in distinct
 * existing types from saved sources so the list grows as the team adds new ones. */
export const DEFAULT_SOURCE_TYPES: string[] = [
  'Pricing sheet',
  'Contract / agreement',
  'Documentation',
  'Support / escalation',
  'Marketing',
  'Training',
  'Partner portal',
  'Reference',
];
