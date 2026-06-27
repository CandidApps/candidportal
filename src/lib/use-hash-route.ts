'use client';

import { useEffect, useRef } from 'react';

/**
 * Two-way sync between a view-state value and the URL hash so every major screen
 * is bookmarkable / reloadable / deep-linkable (TASK-002).
 *
 * - `value` is the current view id (e.g. an AdminView/MemberView).
 * - `slugForValue` maps a view id to its URL slug (e.g. 'customers' -> 'accounts').
 * - `valueForSlug` maps a slug back to a view id; return null for unknown slugs.
 * - `onNavigate` is called when the hash changes (back/forward or external link).
 *
 * Writing the hash never triggers `onNavigate` (we de-dupe against the last
 * value we wrote), so this won't fight the component's own state updates.
 */
export function useHashRoute<T extends string>(opts: {
  enabled: boolean;
  value: T;
  slugForValue: (value: T) => string;
  valueForSlug: (slug: string) => T | null;
  onNavigate: (value: T) => void;
}) {
  const { enabled, value, slugForValue, valueForSlug, onNavigate } = opts;
  const lastWritten = useRef<string | null>(null);
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  const valueForSlugRef = useRef(valueForSlug);
  valueForSlugRef.current = valueForSlug;

  // Apply the hash present on first mount (deep-link / reload).
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const slug = window.location.hash.replace(/^#\/?/, '').split('?')[0];
    if (!slug) return;
    const next = valueForSlugRef.current(slug);
    if (next) {
      lastWritten.current = slug;
      onNavigateRef.current(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Respond to browser back/forward and externally-changed hashes.
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const onHashChange = () => {
      const slug = window.location.hash.replace(/^#\/?/, '').split('?')[0];
      if (slug === lastWritten.current) return;
      const next = valueForSlugRef.current(slug);
      if (next) {
        lastWritten.current = slug;
        onNavigateRef.current(next);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [enabled]);

  // Reflect state changes back into the hash.
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const slug = slugForValue(value);
    if (slug === lastWritten.current) return;
    lastWritten.current = slug;
    const url = `${window.location.pathname}${window.location.search}#${slug}`;
    window.history.replaceState(null, '', url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, value]);
}

/** Read the current hash slug once (e.g. for initial-state decisions). */
export function currentHashSlug(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hash.replace(/^#\/?/, '').split('?')[0];
}
