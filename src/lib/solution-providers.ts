'use client';

import { getBmwDeals } from '@/lib/bmw/deal-master';
import { paySourceKey } from '@/lib/commission-partners';
import { slugifyProviderName } from '@/lib/solution-providers-db';
import type {
  SolutionProviderRecord,
  SupplierContact,
  SupplierSolution,
} from '@/lib/solution-providers-types';
import type { BmwDeal } from '@/lib/bmw/types';

export type { SolutionProviderRecord, SupplierContact, SupplierSolution };

const STORAGE_KEY = 'candid-solution-providers';
const MIGRATED_KEY = 'candid-solution-providers-migrated';
const EVENT = 'candid-solution-providers-updated';

let cache: SolutionProviderRecord[] | null = null;
let loadPromise: Promise<SolutionProviderRecord[]> | null = null;

function emitUpdate() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(EVENT));
}

function readLocalStore(): Record<string, SolutionProviderRecord> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, SolutionProviderRecord>;
  } catch {
    return {};
  }
}

function clearLocalStore() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Unique provider names from BMW deal master. */
export function bmwProviderNames(): string[] {
  const names = new Set<string>();
  for (const deal of getBmwDeals()) {
    const p = deal.provider?.trim();
    if (p) names.add(p);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function seedSolutionsFromDeals(providerName: string): SupplierSolution[] {
  const key = paySourceKey(providerName);
  const deals = getBmwDeals().filter((d) => paySourceKey(d.provider) === key);
  const bySolution = new Map<string, SupplierSolution>();

  for (const deal of deals) {
    const solutionName =
      deal.product?.trim() || deal.serviceDescription?.trim() || 'General';
    const solKey = solutionName.toLowerCase();
    let sol = bySolution.get(solKey);
    if (!sol) {
      sol = {
        id: newId('sol'),
        name: solutionName,
        description: deal.serviceDescription?.trim() || undefined,
        partnerRates: {},
      };
      bySolution.set(solKey, sol);
    }
    if (deal.paySource && deal.rate != null && Number.isFinite(deal.rate)) {
      const ratePct = deal.rate <= 1 ? Math.round(deal.rate * 10000) / 100 : deal.rate;
      const psKey = paySourceKey(deal.paySource);
      if (sol.partnerRates[psKey] == null) {
        sol.partnerRates[psKey] = ratePct;
      }
    }
  }

  return [...bySolution.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function bmwStub(providerName: string): SolutionProviderRecord {
  const now = new Date().toISOString();
  return {
    id: slugifyProviderName(providerName),
    name: providerName,
    contacts: [],
    solutions: seedSolutionsFromDeals(providerName),
    fromBmwOnly: true,
    createdAt: now,
    updatedAt: now,
  };
}

function providerMatchesBmwName(saved: SolutionProviderRecord, bmwName: string): boolean {
  if (paySourceKey(saved.name) === paySourceKey(bmwName)) return true;
  const bmwSlug = slugifyProviderName(bmwName);
  if (saved.id === bmwSlug) return true;
  if (slugifyProviderName(saved.name) === bmwSlug) return true;
  return false;
}

function mergeWithBmw(remote: SolutionProviderRecord[]): SolutionProviderRecord[] {
  const merged = [...remote];
  for (const name of bmwProviderNames()) {
    const hasSaved = remote.some((p) => providerMatchesBmwName(p, name));
    if (!hasSaved) {
      merged.push(bmwStub(name));
    }
  }
  return merged.sort((a, b) => (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name));
}

/** Prefer the persisted DB record when BMW stubs share a similar name/slug. */
export function preferSavedProvider(
  provider: SolutionProviderRecord,
  list?: SolutionProviderRecord[],
): SolutionProviderRecord {
  const providers = list ?? getCache();
  if (provider.dbId && !provider.fromBmwOnly) return provider;
  const match = providers.find(
    (p) =>
      p.dbId &&
      !p.fromBmwOnly &&
      (p.id === provider.id || providerMatchesBmwName(p, provider.name)),
  );
  return match ?? provider;
}

async function migrateLocalStorageIfNeeded(remote: SolutionProviderRecord[]): Promise<SolutionProviderRecord[]> {
  if (typeof window === 'undefined') return remote;
  if (localStorage.getItem(MIGRATED_KEY)) return remote;

  const local = Object.values(readLocalStore()).filter((p) => !p.fromBmwOnly);
  if (!local.length) {
    localStorage.setItem(MIGRATED_KEY, '1');
    return remote;
  }

  try {
    const res = await fetch('/api/admin/solution-providers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: local }),
    });
    if (res.ok) {
      const body = (await res.json()) as { records?: SolutionProviderRecord[] };
      localStorage.setItem(MIGRATED_KEY, '1');
      clearLocalStore();
      return body.records ?? remote;
    }
  } catch {
    // Keep local data if migration fails
  }
  return remote;
}

/** Load providers from Supabase and merge with BMW stubs. */
export async function loadSolutionProviders(): Promise<SolutionProviderRecord[]> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const res = await fetch('/api/admin/solution-providers', { cache: 'no-store' });
      if (res.ok) {
        let remote = (await res.json()) as SolutionProviderRecord[];
        remote = await migrateLocalStorageIfNeeded(remote);
        cache = mergeWithBmw(remote);
        return cache;
      }
    } catch {
      // Fall through to local/BMW
    }

    const local = Object.values(readLocalStore());
    const savedKeys = new Set(local.map((p) => paySourceKey(p.name)));
    const merged = [...local];
    for (const name of bmwProviderNames()) {
      if (!savedKeys.has(paySourceKey(name))) merged.push(bmwStub(name));
    }
    cache = merged.sort((a, b) => (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name));
    return cache;
  })().finally(() => {
    loadPromise = null;
  });

  return loadPromise;
}

function getCache(): SolutionProviderRecord[] {
  return cache ?? mergeWithBmw(Object.values(readLocalStore()));
}

function updateCacheRecord(record: SolutionProviderRecord) {
  const list = getCache();
  const idx = list.findIndex(
    (p) => p.id === record.id || paySourceKey(p.name) === paySourceKey(record.name),
  );
  if (idx >= 0) list[idx] = record;
  else list.push(record);
  cache = [...list].sort((a, b) => (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name));
  emitUpdate();
}

async function persistProvider(record: SolutionProviderRecord): Promise<SolutionProviderRecord> {
  const res = await fetch('/api/admin/solution-providers', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...record, fromBmwOnly: false }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Failed to save provider');
  }
  const saved = (await res.json()) as SolutionProviderRecord;
  updateCacheRecord(saved);
  return saved;
}

export function getSolutionProvider(id: string): SolutionProviderRecord | null {
  const list = getCache();
  const direct = list.find((p) => p.id === id);
  if (direct) return preferSavedProvider(direct, list);
  const byName = list.find((p) => paySourceKey(p.name) === paySourceKey(id));
  if (byName) return preferSavedProvider(byName, list);
  const bySlug = list.find((p) => slugifyProviderName(p.name) === id || p.id === slugifyProviderName(id));
  if (bySlug) return preferSavedProvider(bySlug, list);
  const bmwName = bmwProviderNames().find(
    (n) => slugifyProviderName(n) === id || paySourceKey(n) === paySourceKey(id),
  );
  if (!bmwName) return null;
  const stub = bmwStub(bmwName);
  return preferSavedProvider(stub, list);
}

/** Synchronous read from cache (call loadSolutionProviders first). */
export function getAllSolutionProviders(): SolutionProviderRecord[] {
  return getCache();
}

export async function saveSolutionProvider(record: SolutionProviderRecord): Promise<SolutionProviderRecord> {
  try {
    return await persistProvider({ ...record, fromBmwOnly: false });
  } catch {
    const store = readLocalStore();
    const updated: SolutionProviderRecord = {
      ...record,
      fromBmwOnly: false,
      updatedAt: new Date().toISOString(),
    };
    store[updated.id] = updated;
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    }
    updateCacheRecord(updated);
    return updated;
  }
}

export async function createSolutionProvider(name: string): Promise<SolutionProviderRecord> {
  try {
    const res = await fetch('/api/admin/solution-providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? 'Failed to create provider');
    }
    const saved = (await res.json()) as SolutionProviderRecord;
    updateCacheRecord(saved);
    return saved;
  } catch {
    const trimmed = name.trim();
    const now = new Date().toISOString();
    const record: SolutionProviderRecord = {
      id: slugifyProviderName(trimmed) || newId('provider'),
      name: trimmed,
      contacts: [],
      solutions: [],
      createdAt: now,
      updatedAt: now,
    };
    return saveSolutionProvider(record);
  }
}

async function ensureSaved(provider: SolutionProviderRecord): Promise<SolutionProviderRecord> {
  if (!provider.fromBmwOnly && provider.dbId) return provider;
  return saveSolutionProvider({ ...provider, fromBmwOnly: false });
}

export async function upsertSolutionProviderContact(
  providerId: string,
  contact: Omit<SupplierContact, 'id'> & { id?: string },
): Promise<SolutionProviderRecord | null> {
  const provider = getSolutionProvider(providerId);
  if (!provider) return null;
  const saved = await ensureSaved(provider);
  const contacts = [...saved.contacts];
  const id = contact.id ?? newId('contact');
  const idx = contacts.findIndex((c) => c.id === id);
  const row: SupplierContact = { ...contact, id };
  if (idx >= 0) contacts[idx] = row;
  else contacts.push(row);
  if (row.isPrimary) {
    for (const c of contacts) {
      if (c.id !== id) c.isPrimary = false;
    }
  }
  return saveSolutionProvider({ ...saved, contacts });
}

export async function removeSolutionProviderContact(
  providerId: string,
  contactId: string,
): Promise<SolutionProviderRecord | null> {
  const provider = getSolutionProvider(providerId);
  if (!provider) return null;
  const saved = await ensureSaved(provider);
  return saveSolutionProvider({
    ...saved,
    contacts: saved.contacts.filter((c) => c.id !== contactId),
  });
}

export async function upsertSupplierSolution(
  providerId: string,
  solution: Omit<SupplierSolution, 'id'> & { id?: string },
): Promise<SolutionProviderRecord | null> {
  const provider = getSolutionProvider(providerId);
  if (!provider) return null;
  const saved = await ensureSaved(provider);
  const solutions = [...saved.solutions];
  const id = solution.id ?? newId('sol');
  const idx = solutions.findIndex((s) => s.id === id);
  const row: SupplierSolution = { ...solution, id };
  if (idx >= 0) solutions[idx] = row;
  else solutions.push(row);
  return saveSolutionProvider({ ...saved, solutions });
}

export async function removeSupplierSolution(
  providerId: string,
  solutionId: string,
): Promise<SolutionProviderRecord | null> {
  const provider = getSolutionProvider(providerId);
  if (!provider) return null;
  const saved = await ensureSaved(provider);
  return saveSolutionProvider({
    ...saved,
    solutions: saved.solutions.filter((s) => s.id !== solutionId),
  });
}

/** BMW deals for a solution provider (actual vendor). */
export function dealsForProvider(providerName: string): BmwDeal[] {
  const key = paySourceKey(providerName);
  return getBmwDeals().filter((d) => paySourceKey(d.provider) === key);
}

export type ProviderCustomerRow = {
  merchant: string;
  paySource: string;
  product: string;
  dealUid: string;
  agentCommId: string;
  active: boolean;
  rate: number | null;
};

export function customerRowsForProvider(providerName: string): ProviderCustomerRow[] {
  return dealsForProvider(providerName).map((d) => ({
    merchant: d.merchant,
    paySource: d.paySource,
    product: d.product || d.serviceDescription || '—',
    dealUid: d.dealUid,
    agentCommId: d.agentCommId,
    active: d.activeDeal,
    rate: d.rate,
  }));
}

/** Look up configured Candid commission rate for a provider + solution + pay source. */
export function lookupSolutionCommissionRate(
  providerName: string,
  solutionName: string,
  paySource: string,
): number | null {
  const provider =
    getSolutionProvider(providerName) ??
    getSolutionProvider(slugifyProviderName(providerName));
  if (!provider) return null;
  const solKey = solutionName.trim().toLowerCase();
  const solution =
    provider.solutions.find((s) => s.name.toLowerCase() === solKey) ??
    provider.solutions.find(
      (s) => solKey.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(solKey),
    );
  if (!solution) return null;
  const rate = solution.partnerRates[paySourceKey(paySource)];
  return rate != null && Number.isFinite(rate) ? rate : null;
}

export function onSolutionProvidersUpdated(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** Persist every BMW-seeded vendor stub to Supabase (enables guides + edits). */
export async function saveAllBmwSolutionProviders(): Promise<{ imported: number }> {
  const stubs = getAllSolutionProviders().filter((p) => p.fromBmwOnly);
  if (!stubs.length) return { imported: 0 };

  const res = await fetch('/api/admin/solution-providers', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: stubs, includeBmwStubs: true }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Failed to save BMW vendors');
  }

  const body = (await res.json()) as { imported?: number; records?: SolutionProviderRecord[] };
  if (body.records) {
    cache = mergeWithBmw(body.records);
    emitUpdate();
  }
  return { imported: body.imported ?? 0 };
}
