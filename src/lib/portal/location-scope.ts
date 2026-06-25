import type { Customer, Location } from '@/components/CustomersView';
import type { PortalSessionScope } from '@/lib/portal-access';

/** Member-selected filter: null = use scope default, '' = all locations, else single location id */
export type PortalLocationViewFilter = string | null;

export function memberHasMasterLocationAccess(
  scope: PortalSessionScope | null | undefined,
  customer: Customer | undefined,
): boolean {
  if (!scope || !customer) return false;
  if (scope.locationIds.length === 0) return true;
  const contact = customer.contacts.find((c) => c.id === scope.contactId);
  if (contact?.isPrimary) return true;
  const primaryId = customer.locations.find((l) => l.isPrimary)?.id ?? customer.locations[0]?.id;
  if (
    primaryId &&
    scope.locationIds.length === 1 &&
    scope.locationIds[0] === primaryId
  ) {
    return true;
  }
  return false;
}

export function resolveEffectiveMemberLocationIds(args: {
  scope: PortalSessionScope | null | undefined;
  customer: Customer | undefined;
  viewFilter: PortalLocationViewFilter;
}): string[] {
  const { scope, customer, viewFilter } = args;
  if (!scope) return [];

  if (viewFilter === '') return [];

  if (viewFilter) return [viewFilter];

  if (memberHasMasterLocationAccess(scope, customer)) return [];

  return scope.locationIds;
}

export function portalLocationOptions(
  locations: Location[],
): { id: string; label: string }[] {
  return locations.map((l) => ({
    id: l.id,
    label: l.isPrimary ? `${l.label} (primary)` : l.label,
  }));
}
