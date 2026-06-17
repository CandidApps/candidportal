export type SupplierContact = {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  isPrimary: boolean;
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
  contacts: SupplierContact[];
  solutions: SupplierSolution[];
  /** True when seeded from BMW deals only (not yet saved to registry). */
  fromBmwOnly?: boolean;
  createdAt: string;
  updatedAt: string;
};
