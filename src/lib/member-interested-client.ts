'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type { SolutionCategoryId } from '@/lib/solutions/catalog';

export type InterestedItem = {
  name: string;
  category?: SolutionCategoryId;
  providerId?: number;
};

type State = { items: InterestedItem[]; loaded: boolean };

const EMPTY: State = { items: [], loaded: false };
let state: State = EMPTY;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setState(next: State) {
  state = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function loadInterested(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = (async () => {
    try {
      const res = await fetch('/api/portal/interested', { cache: 'no-store' });
      const json = (await res.json().catch(() => ({}))) as { items?: InterestedItem[] };
      setState({ items: res.ok ? (json.items ?? []) : state.items, loaded: true });
    } catch {
      setState({ ...state, loaded: true });
    }
  })();
  return loading;
}

async function persist(action: 'add' | 'remove', item: InterestedItem): Promise<boolean> {
  try {
    const res = await fetch('/api/portal/interested', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...item }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function isInterested(name: string): boolean {
  return state.items.some((i) => sameName(i.name, name));
}

export async function toggleInterested(item: InterestedItem): Promise<void> {
  const prev = state;
  const removing = isInterested(item.name);
  setState({
    ...state,
    items: removing ? state.items.filter((i) => !sameName(i.name, item.name)) : [...state.items, item],
  });
  const ok = await persist(removing ? 'remove' : 'add', item);
  if (!ok) setState(prev);
}

export async function removeInterested(name: string): Promise<void> {
  if (!isInterested(name)) return;
  await toggleInterested({ name });
}

/** Shared Interested list for cards, the supplier modal, the top-bar icon and the Interested page. */
export function useInterested() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  useEffect(() => {
    if (!state.loaded) void loadInterested();
  }, []);
  return {
    items: snapshot.items,
    loaded: snapshot.loaded,
    has: (name: string) => snapshot.items.some((i) => sameName(i.name, name)),
  };
}
