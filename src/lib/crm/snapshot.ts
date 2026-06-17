import type { Customer } from '@/components/CustomersView';
import { bmwDealsToCustomers, getBmwDeals } from '@/lib/bmw/deal-master';
import { applyContractOverridesMap } from '@/lib/customer-contract-overrides';
import {
  buildContractsFromDeals,
  dedupeCustomerContractMap,
  mergeContractMaps,
} from '@/lib/customer-contracts-from-deals';
import type { CandidContractRecord, CustomerDocument } from '@/lib/customer-records';
import {
  applyPortalImportToCustomers,
  buildPortalImportContracts,
  buildPortalImportDocuments,
} from '@/lib/portal-import/merge';

export type CrmSnapshot = {
  customers: Customer[];
  documentsByCustomerId: Record<string, CustomerDocument[]>;
  contractsByCustomerId: Record<string, CandidContractRecord[]>;
};

function mergeCustomerPair(a: Customer, b: Customer): Customer {
  const primary = a.company.length >= b.company.length ? a : b;
  const secondary = primary === a ? b : a;
  const contactIds = new Set<string>();
  const contacts = [...primary.contacts, ...secondary.contacts].filter((c) => {
    if (contactIds.has(c.id)) return false;
    contactIds.add(c.id);
    return true;
  });
  const locationIds = new Set<string>();
  const locations = [...primary.locations, ...secondary.locations].filter((l) => {
    if (locationIds.has(l.id)) return false;
    locationIds.add(l.id);
    return true;
  });
  return {
    ...primary,
    company: primary.company.length >= secondary.company.length ? primary.company : secondary.company,
    spend: Math.max(primary.spend, secondary.spend),
    savings: Math.max(primary.savings, secondary.savings),
    contracts: Math.max(primary.contracts, secondary.contracts),
    files: Math.max(primary.files, secondary.files),
    portal: primary.portal ?? secondary.portal,
    contacts,
    locations,
  };
}

function dedupeCustomersById(customers: Customer[]): Customer[] {
  const byId = new Map<string, Customer>();
  for (const customer of customers) {
    const existing = byId.get(customer.id);
    byId.set(customer.id, existing ? mergeCustomerPair(existing, customer) : customer);
  }
  return [...byId.values()];
}

/** Build the full in-memory CRM snapshot (BMW + portal import). */
export function buildCrmSnapshot(): CrmSnapshot {
  const customers = dedupeCustomersById(applyPortalImportToCustomers(bmwDealsToCustomers()));
  const bmwCustomers = bmwDealsToCustomers();

  const documentsByCustomerId = buildPortalImportDocuments(customers, { includeOffDisk: true });

  const contractsByCustomerId = applyContractOverridesMap(
    dedupeCustomerContractMap(
      mergeContractMaps(
        buildContractsFromDeals(bmwCustomers, getBmwDeals()),
        buildPortalImportContracts(customers),
      ),
    ),
  );

  return { customers, documentsByCustomerId, contractsByCustomerId };
}
