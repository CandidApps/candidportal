'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { SearchableSelect, type SearchableOption } from '@/components/shared/SearchableSelect';
import { loadSolutionProviders, type SolutionProviderRecord } from '@/lib/solution-providers';

/**
 * Searchable dropdown of solution providers (Suppliers & Vendors).
 * Value is the provider display name (stored on contract.solution).
 */
export function ProviderSolutionPicker({
  value,
  onChange,
  inputStyle,
  placeholder = 'Search providers…',
}: {
  value: string;
  onChange: (next: { name: string; id: string }) => void;
  inputStyle?: CSSProperties;
  placeholder?: string;
}) {
  const [providers, setProviders] = useState<SolutionProviderRecord[]>([]);

  useEffect(() => {
    void loadSolutionProviders().then(setProviders).catch(() => setProviders([]));
  }, []);

  const options: SearchableOption[] = useMemo(() => {
    const opts: SearchableOption[] = providers
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({
        value: p.name,
        label: p.name,
        meta: p.providerCategory ? String(p.providerCategory) : undefined,
        keywords: p.id,
      }));
    if (value.trim() && !opts.some((o) => o.value.toLowerCase() === value.trim().toLowerCase())) {
      opts.unshift({
        value: value.trim(),
        label: value.trim(),
        meta: 'Current (not in provider list)',
        keywords: value,
      });
    }
    return opts;
  }, [providers, value]);

  return (
    <SearchableSelect
      value={value}
      options={options}
      placeholder={placeholder}
      emptyLabel="— Select provider —"
      inputStyle={inputStyle}
      onChange={(name) => {
        const hit = providers.find((p) => p.name === name);
        onChange({ name, id: hit?.id ?? '' });
      }}
      aria-label="Provider"
    />
  );
}

function normProviderName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripProviderNoise(s: string): string {
  return normProviderName(s)
    .replace(
      /\b(inc|llc|ltd|corp|corporation|company|co|for business|business|communications|telecom|telecommunications|solutions|services)\b/g,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Best unique match of free-text provider → solution provider name.
 * Exact / normalized / suffix-stripped only — no loose substring matches.
 */
export function matchSolutionProviderName(
  text: string,
  providers: SolutionProviderRecord[],
): SolutionProviderRecord | null {
  const needle = text.trim();
  if (!needle) return null;
  const exact = providers.filter((p) => p.name.trim().toLowerCase() === needle.toLowerCase());
  if (exact.length === 1) return exact[0];
  const needleN = normProviderName(needle);
  const exactNorm = providers.filter((p) => normProviderName(p.name) === needleN);
  if (exactNorm.length === 1) return exactNorm[0];
  const needleS = stripProviderNoise(needle);
  if (!needleS || needleS.length < 2) return null;
  const stripped = providers.filter((p) => stripProviderNoise(p.name) === needleS);
  if (stripped.length === 1) return stripped[0];
  return null;
}

export function useSolutionProviders(): SolutionProviderRecord[] {
  const [providers, setProviders] = useState<SolutionProviderRecord[]>([]);
  const load = useCallback(() => {
    void loadSolutionProviders().then(setProviders).catch(() => setProviders([]));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return providers;
}
