'use client';

import { useEffect, useState } from 'react';
import type { ProductMatchSupplier } from '@/lib/solutions/product-search';

export type { ProductMatchSupplier };

const cache = new Map<string, Promise<ProductMatchSupplier[]>>();

export function fetchProductMatches(query: string): Promise<ProductMatchSupplier[]> {
  const q = query.trim();
  if (q.length < 2) return Promise.resolve([]);
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const p = fetch(`/api/portal/solutions/products?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : { matches: [] }))
    .then((j: { matches?: ProductMatchSupplier[] }) => j.matches ?? [])
    .catch(() => {
      cache.delete(key);
      return [];
    });
  cache.set(key, p);
  return p;
}

export function normSupplierName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Debounced product matches for a live search box. */
export function useProductMatches(query: string, delayMs = 250): ProductMatchSupplier[] {
  const [matches, setMatches] = useState<ProductMatchSupplier[]>([]);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setMatches([]);
      return;
    }
    let live = true;
    const t = window.setTimeout(() => {
      void fetchProductMatches(q).then((m) => {
        if (live) setMatches(m);
      });
    }, delayMs);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [query, delayMs]);
  return matches;
}

/** Plain-text summary for AI prompts (Frank, guided search). */
export function describeProductMatches(query: string, matches: ProductMatchSupplier[]): string {
  if (!matches.length) return '';
  const lines = matches
    .slice(0, 12)
    .map((m) => `- ${m.name}: ${m.products.join('; ')}${m.matchCount > m.products.length ? ` (+${m.matchCount - m.products.length} more)` : ''}`);
  return [
    `Candid suppliers with sellable products matching "${query}" (from Candid's product catalog):`,
    ...lines,
    'Recommend from these suppliers when relevant. Do not quote commission or cash back rates.',
  ].join('\n');
}
