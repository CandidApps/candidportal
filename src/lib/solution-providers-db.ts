import type {
  SolutionProviderRecord,
  SupplierContact,
  SupplierSolution,
} from '@/lib/solution-providers-types';

export type DbSolutionProvider = {
  id: number;
  slug: string;
  name: string;
  display_name: string | null;
  website: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DbSolutionProviderContact = {
  id: number;
  provider_id: number;
  name: string;
  role: string;
  email: string;
  phone: string;
  is_primary: boolean;
  notes: string | null;
};

export type DbSolutionProviderSolution = {
  id: number;
  provider_id: number;
  name: string;
  description: string | null;
};

export type DbSolutionProviderSolutionRate = {
  id: number;
  solution_id: number;
  pay_source: string;
  rate_pct: number;
};

export function slugifyProviderName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function contactIdFromDb(id: number): string {
  return `c-${id}`;
}

export function solutionIdFromDb(id: number): string {
  return `sol-${id}`;
}

export function parseDbContactId(id: string): number | null {
  const m = /^c-(\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
}

export function parseDbSolutionId(id: string): number | null {
  const m = /^sol-(\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
}

export function mapDbToRecord(
  provider: DbSolutionProvider,
  contacts: DbSolutionProviderContact[],
  solutions: DbSolutionProviderSolution[],
  rates: DbSolutionProviderSolutionRate[],
): SolutionProviderRecord {
  const ratesBySolution = new Map<number, DbSolutionProviderSolutionRate[]>();
  for (const rate of rates) {
    const list = ratesBySolution.get(rate.solution_id) ?? [];
    list.push(rate);
    ratesBySolution.set(rate.solution_id, list);
  }

  return {
    id: provider.slug,
    dbId: provider.id,
    name: provider.name,
    displayName: provider.display_name ?? undefined,
    website: provider.website ?? undefined,
    notes: provider.notes ?? undefined,
    contacts: contacts
      .filter((c) => c.provider_id === provider.id)
      .map(
        (c): SupplierContact => ({
          id: contactIdFromDb(c.id),
          name: c.name,
          role: c.role,
          email: c.email,
          phone: c.phone,
          isPrimary: c.is_primary,
          notes: c.notes ?? undefined,
        }),
      ),
    solutions: solutions
      .filter((s) => s.provider_id === provider.id)
      .map((s): SupplierSolution => {
        const partnerRates: Record<string, number> = {};
        for (const rate of ratesBySolution.get(s.id) ?? []) {
          partnerRates[rate.pay_source.toLowerCase()] = Number(rate.rate_pct);
        }
        return {
          id: solutionIdFromDb(s.id),
          name: s.name,
          description: s.description ?? undefined,
          partnerRates,
        };
      }),
    fromBmwOnly: false,
    createdAt: provider.created_at,
    updatedAt: provider.updated_at,
  };
}
