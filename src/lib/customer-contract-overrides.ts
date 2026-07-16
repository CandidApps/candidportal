'use client';

import { contractHideKeys } from '@/lib/customer-contracts-from-deals';
import type { CandidContractRecord } from '@/lib/customer-records';

const KEY = 'candid-customer-contract-overrides';
const HIDDEN_KEY = 'candid-customer-contract-hidden';

/** Partial contract patch; `null` on a field means explicitly clear it. */
export type ContractOverride = {
  [K in keyof Pick<
    CandidContractRecord,
    | 'dealStatus'
    | 'agentCommId'
    | 'agentOfRecord'
    | 'agentCommissionRate'
    | 'paySource'
    | 'serviceTypeId'
    | 'dealId'
    | 'service'
    | 'product'
    | 'solution'
    | 'solutionDescription'
    | 'merchantPricing'
    | 'pricingStructureId'
    | 'pricingLineItems'
    | 'mrr'
    | 'mrc'
    | 'taxRatePercent'
    | 'estimatedTotalBill'
    | 'monthly'
    | 'candidCommissionRate'
    | 'commissionAmount'
    | 'spiffExpected'
    | 'contractStartDate'
    | 'contractEndDate'
    | 'contractTerms'
    | 'locationId'
    | 'physicalLocationId'
    | 'billingLocationId'
    | 'vendor'
    | 'expires'
    | 'autoRenews'
  >]?: CandidContractRecord[K] | null;
};

function applyOverridePatch(
  contract: CandidContractRecord,
  patch: ContractOverride,
): CandidContractRecord {
  const out = { ...contract };
  for (const [rawKey, value] of Object.entries(patch) as [keyof ContractOverride, unknown][]) {
    if (value === null) {
      delete out[rawKey as keyof CandidContractRecord];
    } else if (value !== undefined) {
      (out as Record<string, unknown>)[rawKey] = value;
    }
  }
  return out;
}

function mergeOverrideStore(
  prev: ContractOverride | undefined,
  patch: ContractOverride,
): ContractOverride {
  return { ...prev, ...patch };
}

function readAll(): Record<string, ContractOverride> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, ContractOverride>;
  } catch {
    return {};
  }
}

function writeAll(store: Record<string, ContractOverride>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(store));
  window.dispatchEvent(new Event('candid-contract-updated'));
}

function readHidden(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]') as string[];
    return new Set(raw);
  } catch {
    return new Set();
  }
}

function writeHidden(ids: Set<string>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(HIDDEN_KEY, JSON.stringify([...ids]));
}

export function isContractHidden(
  contract: CandidContractRecord,
  hidden: Set<string> = readHidden(),
): boolean {
  return contractHideKeys(contract).some((key) => hidden.has(key));
}

export function filterHiddenContracts(contracts: CandidContractRecord[]): CandidContractRecord[] {
  const hidden = readHidden();
  return contracts.filter((c) => !isContractHidden(c, hidden));
}

/** Persist removal without triggering a deal rebuild (caller updates React state). */
export function hideContract(contract: CandidContractRecord): void {
  const ids = readHidden();
  for (const key of contractHideKeys(contract)) ids.add(key);
  writeHidden(ids);
}

export function getContractOverride(contractId: string): ContractOverride | undefined {
  return readAll()[contractId];
}

export function setContractOverride(contractId: string, patch: ContractOverride): void {
  const store = readAll();
  store[contractId] = mergeOverrideStore(store[contractId], patch);
  writeAll(store);
}

export function applyContractOverrides(contracts: CandidContractRecord[]): CandidContractRecord[] {
  const hidden = readHidden();
  const store = readAll();
  return contracts
    .filter((c) => !isContractHidden(c, hidden))
    .map((c) => {
      const patch = store[c.id];
      if (!patch) return c;
      return applyOverridePatch(c, patch);
    });
}

export function applyContractOverridesMap(
  map: Record<string, CandidContractRecord[]>,
): Record<string, CandidContractRecord[]> {
  const out: Record<string, CandidContractRecord[]> = {};
  for (const [customerId, contracts] of Object.entries(map)) {
    out[customerId] = applyContractOverrides(contracts);
  }
  return out;
}
