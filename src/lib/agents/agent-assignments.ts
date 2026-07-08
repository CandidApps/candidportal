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
  /** ISO date (YYYY-MM-DD). Commissions from this month onward go to Candid Solutions. */
  inactiveEffectiveDate?: string | null;
  /** When inactive, continue paying override partners on this agent's tiers (default true). */
  keepOverridePartners?: boolean;
  notes?: string;
};

type CustomerTierStore = Record<string, string>;
type ProfileStore = Record<string, AgentProfileOverride>;

function emitUpdate() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(EVENT));
  window.dispatchEvent(new Event('candid-commissions-updated'));
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

export function hydrateAgentProfileOverrides(profiles: Record<string, AgentProfileOverride>): void {
  if (typeof window === 'undefined') return;
  const local = readProfiles();
  writeProfiles({ ...local, ...profiles });
}

/** Load agent profile settings from Supabase into local cache. */
export async function syncAgentProfilesFromServer(): Promise<void> {
  const res = await fetch('/api/admin/agent-profiles', { cache: 'no-store' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Failed to load agent profiles (${res.status})`);
  }
  const json = (await res.json()) as { profiles?: Record<string, AgentProfileOverride> };
  hydrateAgentProfileOverrides(json.profiles ?? {});
}

export async function saveAgentProfileOverride(
  mergeKey: string,
  patch: AgentProfileOverride,
): Promise<void> {
  const store = readProfiles();
  const merged = { ...store[mergeKey], ...patch };
  if (merged.status !== 'inactive') {
    merged.inactiveEffectiveDate = null;
    merged.keepOverridePartners = undefined;
  }
  store[mergeKey] = merged;
  writeProfiles(store);

  const res = await fetch('/api/admin/agent-profiles', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mergeKey, profile: merged }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Failed to save agent profile (${res.status})`);
  }
}

export function onAgentsUpdated(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
