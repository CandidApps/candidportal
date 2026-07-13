import type { Customer } from '@/components/CustomersView';
import { bmwDealsToCustomers, getBmwDeals, parentMerchantFor } from '@/lib/bmw/deal-master';
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

function locationAddressKey(location: { street: string; city: string; state: string; zip: string }): string {
  return [location.street, location.city, location.state, location.zip]
    .map((part) => part.trim().toLowerCase())
    .join('|');
}

function canonicalCompanyKey(company: string): string {
  return parentMerchantFor(company.trim()).toLowerCase();
}

function customerRichness(customer: Customer): number {
  return (
    customer.locations.length * 10
    + customer.contacts.length * 5
    + customer.contracts
    + customer.files
  );
}

function mergeCustomerPair(a: Customer, b: Customer): Customer {
  const primary = customerRichness(a) >= customerRichness(b) ? a : b;
  const secondary = primary === a ? b : a;
  const contactIds = new Set<string>();
  const contacts = [...primary.contacts, ...secondary.contacts].filter((c) => {
    if (contactIds.has(c.id)) return false;
    contactIds.add(c.id);
    return true;
  });
  const locationIds = new Set<string>();
  const locationAddresses = new Set<string>();
  const locations = [...primary.locations, ...secondary.locations].filter((l) => {
    if (locationIds.has(l.id)) return false;
    const addr = locationAddressKey(l);
    if (addr.replace(/\|/g, '') && locationAddresses.has(addr)) return false;
    locationIds.add(l.id);
    if (addr.replace(/\|/g, '')) locationAddresses.add(addr);
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

/** Merge separate CRM rows that share the same company / DBA (e.g. duplicate BMW customer IDs). */
export function dedupeCustomersByCompanyName(
  customers: Customer[],
  documentsByCustomerId: Record<string, CustomerDocument[]> = {},
  contractsByCustomerId: Record<string, CandidContractRecord[]> = {},
): {
  customers: Customer[];
  documentsByCustomerId: Record<string, CustomerDocument[]>;
  contractsByCustomerId: Record<string, CandidContractRecord[]>;
} {
  const byCompany = new Map<string, Customer>();
  const docs: Record<string, CustomerDocument[]> = {};
  const contracts: Record<string, CandidContractRecord[]> = {};

  for (const customer of customers) {
    const key = canonicalCompanyKey(customer.company);
    const existing = byCompany.get(key);
    if (!existing) {
      byCompany.set(key, customer);
      docs[customer.id] = [...(documentsByCustomerId[customer.id] ?? [])];
      contracts[customer.id] = [...(contractsByCustomerId[customer.id] ?? [])];
      continue;
    }

    const merged = mergeCustomerPair(existing, customer);
    byCompany.set(key, merged);

    const mergedDocs = [
      ...(docs[merged.id] ?? []),
      ...(documentsByCustomerId[customer.id] ?? []),
      ...(customer.id !== merged.id ? documentsByCustomerId[merged.id] ?? [] : []),
    ];
    const mergedContracts = [
      ...(contracts[merged.id] ?? []),
      ...(contractsByCustomerId[customer.id] ?? []),
      ...(customer.id !== merged.id ? contractsByCustomerId[merged.id] ?? [] : []),
    ];
    docs[merged.id] = mergedDocs;
    contracts[merged.id] = mergedContracts;
    if (customer.id !== merged.id) {
      delete docs[customer.id];
      delete contracts[customer.id];
    }
    if (existing.id !== merged.id) {
      delete docs[existing.id];
      delete contracts[existing.id];
    }
  }

  return {
    customers: [...byCompany.values()].sort((a, b) =>
      a.company.localeCompare(b.company, undefined, { sensitivity: 'base' }),
    ),
    documentsByCustomerId: docs,
    contractsByCustomerId: contracts,
  };
}

/** Build the full in-memory CRM snapshot (BMW + portal import). */
export function buildCrmSnapshot(): CrmSnapshot {
  const rawCustomers = dedupeCustomersById(applyPortalImportToCustomers(bmwDealsToCustomers()));
  const bmwCustomers = bmwDealsToCustomers();

  const portalDocs = buildPortalImportDocuments(rawCustomers, { includeOffDisk: true });
  const portalContracts = buildPortalImportContracts(rawCustomers);
  const dealContracts = applyContractOverridesMap(
    dedupeCustomerContractMap(
      mergeContractMaps(
        buildContractsFromDeals(bmwCustomers, getBmwDeals()),
        portalContracts,
      ),
    ),
  );

  const merged = dedupeCustomersByCompanyName(rawCustomers, portalDocs, dealContracts);

  return {
    customers: merged.customers,
    documentsByCustomerId: merged.documentsByCustomerId,
    contractsByCustomerId: merged.contractsByCustomerId,
  };
}
