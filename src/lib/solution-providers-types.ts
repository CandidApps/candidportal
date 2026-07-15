import type { ProviderCategory } from '@/lib/provider-categories';

export type SupplierContact = {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  isPrimary: boolean;
  /** Customer may email this contact directly for their own service/account. */
  clientFacing?: boolean;
  notes?: string;
};

export type SupplierSolution = {
  id: string;
  name: string;
  description?: string;
  /** Candid residual commission rate % through each commission partner (pay source). */
  partnerRates: Record<string, number>;
};

export type SolutionProviderRecord = {
  id: string;
  /** Supabase row id when persisted. */
  dbId?: number;
  name: string;
  displayName?: string;
  website?: string;
  notes?: string;
  /** Admin-uploaded logo URL (preferred over Google favicon). */
  logoUrl?: string;
  logoStoragePath?: string;
  /** Customer-facing Find Solutions description. */
  description?: string;
  /** Highlight on Find Solutions as Candid Recommended. */
  candidRecommended?: boolean;
  /** Capability tags for Find Solutions cards/filters. */
  findCapabilities?: string[];
  /** Product/service tags for Find Solutions cards/filters. */
  findServices?: string[];
  providerCategory?: ProviderCategory;
  /** When true, this supplier's rates feed customer savings analysis. */
  includeRatesInAnalysis?: boolean;
  contacts: SupplierContact[];
  solutions: SupplierSolution[];
  /** True when seeded from BMW deals only (not yet saved to registry). */
  fromBmwOnly?: boolean;
  createdAt: string;
  updatedAt: string;
};
