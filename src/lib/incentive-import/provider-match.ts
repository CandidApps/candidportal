import type { SolutionProviderRecord } from '@/lib/solution-providers-types';

const NOISE = /\b(inc|llc|ltd|corp|corporation|co|company|the|business|services?|solutions?|communications?|telecom|technologies|technology|group)\b/g;

function norm(s: string): string {
  return s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
}

export function providerLabel(p: SolutionProviderRecord): string {
  return p.displayName?.trim() || p.name;
}

/** Best-effort supplier match by name; returns null when ambiguous so the admin picks. */
export function matchProvider(name: string | undefined, providers: SolutionProviderRecord[]): number | null {
  const target = norm(name ?? '');
  if (!target) return null;
  const candidates = providers.filter((p) => p.dbId != null);
  const names = (p: SolutionProviderRecord) => [...new Set([norm(p.name), norm(providerLabel(p))])].filter(Boolean);

  const exact = candidates.filter((p) => names(p).includes(target));
  if (exact.length === 1) return exact[0]!.dbId as number;
  if (exact.length > 1) return null;

  const loose = candidates.filter((p) =>
    names(p).some((n) => n.length >= 3 && (target.startsWith(`${n} `) || n.startsWith(`${target} `))),
  );
  return loose.length === 1 ? (loose[0]!.dbId as number) : null;
}
