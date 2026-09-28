import type { Location } from '@/components/CustomersView';

export const UNKNOWN_LOCATION_LABEL = 'Unknown location';

function locationKeyStem(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/^loc-/, '')
    .replace(/-(loc|hq|primary|main)$/, '');
}

/**
 * Resolve a contract/document location id to an account location.
 * Imported deals sometimes carry a legacy key (e.g. `acme-loc`) while the location row
 * uses another format (`loc-acme-hq`), so fall back to a normalized match, then to the
 * account's only location.
 */
export function resolveLocation(
  locations: Location[] | undefined,
  id: string | null | undefined,
): Location | null {
  const key = id?.trim();
  if (!key || !locations?.length) return null;
  const exact = locations.find((l) => l.id === key);
  if (exact) return exact;
  const stem = locationKeyStem(key);
  const stemMatches = locations.filter((l) => locationKeyStem(l.id) === stem);
  if (stemMatches.length === 1) return stemMatches[0]!;
  return locations.length === 1 ? locations[0]! : null;
}

export function formatLocationAddressLine(loc: Location): string {
  const cityState = [loc.city, loc.state].filter(Boolean).join(', ');
  const cityStateZip = [cityState, loc.zip].filter(Boolean).join(' ');
  return [loc.street, cityStateZip].filter(Boolean).join(', ');
}

/** Same label shown in the add/edit contract location picker. */
export function formatLocationOption(loc: Location): string {
  const addr = formatLocationAddressLine(loc);
  return `${loc.label}${loc.isPrimary ? ' (Primary)' : ''}${addr ? ` — ${addr}` : ''}`;
}

export function contractLocationDisplay(
  locations: Location[] | undefined,
  id: string | null | undefined,
): string {
  if (!id?.trim()) return '—';
  const loc = resolveLocation(locations, id);
  return loc ? formatLocationOption(loc) : UNKNOWN_LOCATION_LABEL;
}
