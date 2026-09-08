export type SupplierSourceFrankUse = 'cite' | 'fetch' | 'ignore';

export const SUPPLIER_SOURCE_FRANK_USES: SupplierSourceFrankUse[] = ['cite', 'fetch', 'ignore'];

export const SUPPLIER_SOURCE_FRANK_USE_LABEL: Record<SupplierSourceFrankUse, string> = {
  cite: 'Cite / link only — do not fetch page',
  fetch: 'Frank may open & read this page',
  ignore: 'Hide from Frank (humans only)',
};

export function isSupplierSourceFrankUse(v: unknown): v is SupplierSourceFrankUse {
  return v === 'cite' || v === 'fetch' || v === 'ignore';
}

export type SupplierSource = {
  id: string;
  providerId: string;
  providerDbId?: number;
  providerName: string;
  title: string;
  url: string;
  sourceType: string;
  /** How Frank should treat this link. Default fetch. */
  frankUse: SupplierSourceFrankUse;
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
  'Knowledge base / help center',
  'Support / escalation',
  'Ordering / portal login',
  'SLA / service guide',
  'Marketing',
  'Training',
  'Partner portal',
  'Reference',
];
