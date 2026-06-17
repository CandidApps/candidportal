'use client';

import type { CustomerAction, CustomerActionSeverity } from '@/lib/portal-import/merge';

export type ActionResolutionOutcome =
  | 'renewed'
  | 'cancelled'
  | 'deferred'
  | 'no_change'
  | 'completed'
  | 'other';

export type ResolvedCustomerAction = {
  actionId: string;
  customerId: string;
  actionTitle: string;
  actionKind: CustomerAction['kind'];
  outcome: ActionResolutionOutcome;
  notes: string;
  documentId?: string;
  documentFilename?: string;
  contractId?: string;
  resolvedAt: string;
  resolvedBy: string;
};

export type StoredCustomAction = CustomerAction & {
  customerId: string;
  createdAt: string;
  createdBy: string;
};

type ActionStore = {
  resolutions: ResolvedCustomerAction[];
  customActions: StoredCustomAction[];
};

const KEY = 'candid-customer-actions-v1';

function readStore(): ActionStore {
  if (typeof window === 'undefined') return { resolutions: [], customActions: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { resolutions: [], customActions: [] };
    return JSON.parse(raw) as ActionStore;
  } catch {
    return { resolutions: [], customActions: [] };
  }
}

function writeStore(store: ActionStore): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(store));
  window.dispatchEvent(new Event('candid-customer-actions-updated'));
}

export function getCustomActionsForCustomer(customerId: string): CustomerAction[] {
  return readStore()
    .customActions.filter((a) => a.customerId === customerId)
    .map(({ customerId: _cid, createdAt: _ca, createdBy: _cb, ...action }) => action);
}

export function getResolvedActionsForCustomer(customerId: string): ResolvedCustomerAction[] {
  return readStore()
    .resolutions.filter((r) => r.customerId === customerId)
    .sort((a, b) => b.resolvedAt.localeCompare(a.resolvedAt));
}

export function isActionResolved(customerId: string, actionId: string): boolean {
  return readStore().resolutions.some(
    (r) => r.customerId === customerId && r.actionId === actionId,
  );
}

export function mergeCustomerActions(
  customerId: string,
  portalActions: CustomerAction[],
): CustomerAction[] {
  const store = readStore();
  const resolvedIds = new Set(
    store.resolutions.filter((r) => r.customerId === customerId).map((r) => r.actionId),
  );
  const custom = store.customActions
    .filter((a) => a.customerId === customerId)
    .map(({ customerId: _cid, createdAt: _ca, createdBy: _cb, ...action }) => action);
  return [...portalActions, ...custom].filter((a) => !resolvedIds.has(a.id));
}

export function addCustomCustomerAction(
  customerId: string,
  action: Omit<CustomerAction, 'id' | 'source'>,
  createdBy: string,
): CustomerAction {
  const id = `custom-${customerId}-${Date.now().toString(36)}`;
  const full: StoredCustomAction = {
    ...action,
    id,
    source: 'custom',
    customerId,
    createdAt: new Date().toISOString(),
    createdBy,
  };
  const store = readStore();
  store.customActions.push(full);
  writeStore(store);
  return full;
}

export function resolveCustomerAction(input: {
  customerId: string;
  action: CustomerAction;
  outcome: ActionResolutionOutcome;
  notes: string;
  resolvedBy: string;
  documentId?: string;
  documentFilename?: string;
  contractId?: string;
}): ResolvedCustomerAction {
  const record: ResolvedCustomerAction = {
    actionId: input.action.id,
    customerId: input.customerId,
    actionTitle: input.action.title,
    actionKind: input.action.kind,
    outcome: input.outcome,
    notes: input.notes.trim(),
    documentId: input.documentId,
    documentFilename: input.documentFilename,
    contractId: input.contractId,
    resolvedAt: new Date().toISOString(),
    resolvedBy: input.resolvedBy,
  };
  const store = readStore();
  store.resolutions = store.resolutions.filter(
    (r) => !(r.customerId === input.customerId && r.actionId === input.action.id),
  );
  store.resolutions.push(record);
  writeStore(store);
  return record;
}

export function outcomeLabel(outcome: ActionResolutionOutcome): string {
  const labels: Record<ActionResolutionOutcome, string> = {
    renewed: 'Renewed',
    cancelled: 'Cancelled',
    deferred: 'Deferred',
    no_change: 'No change',
    completed: 'Completed',
    other: 'Closed',
  };
  return labels[outcome];
}

export function severityForCustomAction(
  value: CustomerActionSeverity,
): CustomerActionSeverity {
  return value;
}
