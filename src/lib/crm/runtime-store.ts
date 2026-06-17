import type { BmwAgentRate, BmwDeal } from '@/lib/bmw/types';
import type { Customer } from '@/components/CustomersView';
import type { CandidContractRecord, CustomerDocument } from '@/lib/customer-records';

export type CrmRuntimeData = {
  customers: Customer[];
  documentsByCustomerId: Record<string, CustomerDocument[]>;
  contractsByCustomerId: Record<string, CandidContractRecord[]>;
  bmwDeals: BmwDeal[];
  agentRates: BmwAgentRate[];
  source: 'supabase' | 'empty';
  ready: boolean;
};

const EMPTY: CrmRuntimeData = {
  customers: [],
  documentsByCustomerId: {},
  contractsByCustomerId: {},
  bmwDeals: [],
  agentRates: [],
  source: 'empty',
  ready: false,
};

let store: CrmRuntimeData = { ...EMPTY };

export function getCrmRuntimeData(): CrmRuntimeData {
  return store;
}

export function setCrmRuntimeData(patch: Partial<CrmRuntimeData>): void {
  store = {
    ...store,
    ...patch,
    ready: patch.ready ?? true,
  };
}

export function resetCrmRuntimeData(): void {
  store = { ...EMPTY };
}

export function getCrmCustomers(): Customer[] {
  return store.customers;
}

export function getCrmDocumentsByCustomerId(): Record<string, CustomerDocument[]> {
  return store.documentsByCustomerId;
}

export function getCrmContractsByCustomerId(): Record<string, CandidContractRecord[]> {
  return store.contractsByCustomerId;
}
