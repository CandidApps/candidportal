'use client';

import type { AgentStatus } from '@/components/AgentsView';

const CUSTOMER_TIER_KEY = 'candid-agent-customer-tier-overrides';
const PROFILE_KEY = 'candid-agent-profile-overrides';
const EVENT = 'candid-agents-updated';

export type AgentProfileOverride = {
  company?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  status?: AgentStatus;
  notes?: string;
};

type CustomerTierStore = Record<string, string>;
type ProfileStore = Record<string, AgentProfileOverride>;

function emitUpdate() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(EVENT));
}

function readCustomerTiers(): CustomerTierStore {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(CUSTOMER_TIER_KEY) ?? '{}') as CustomerTierStore;
  } catch {
    return {};
  }
}

function writeCustomerTiers(store: CustomerTierStore) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CUSTOMER_TIER_KEY, JSON.stringify(store));
  emitUpdate();
}

function readProfiles(): ProfileStore {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}') as ProfileStore;
  } catch {
    return {};
  }
}

function writeProfiles(store: ProfileStore) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(store));
  emitUpdate();
}

/** agentCommId tier for a customer, or '' if explicitly removed from agents. */
export function getCustomerTierOverride(customerId: string): string | undefined {
  const store = readCustomerTiers();
  if (!(customerId in store)) return undefined;
  return store[customerId];
}

export function setCustomerTierOverride(customerId: string, tierId: string) {
  const store = readCustomerTiers();
  store[customerId] = tierId;
  writeCustomerTiers(store);
}

export function removeCustomerFromAgents(customerId: string) {
  const store = readCustomerTiers();
  store[customerId] = '';
  writeCustomerTiers(store);
}

export function clearCustomerTierOverride(customerId: string) {
  const store = readCustomerTiers();
  delete store[customerId];
  writeCustomerTiers(store);
}

export function getAgentProfileOverride(mergeKey: string): AgentProfileOverride | undefined {
  return readProfiles()[mergeKey];
}

export function saveAgentProfileOverride(mergeKey: string, patch: AgentProfileOverride) {
  const store = readProfiles();
  store[mergeKey] = { ...store[mergeKey], ...patch };
  writeProfiles(store);
}

export function onAgentsUpdated(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
