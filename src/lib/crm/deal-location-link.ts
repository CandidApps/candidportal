import type { CandidContractRecord } from '@/lib/customer-records';

/** True when a contract/deal is tied to this location external id. */
export function contractMatchesLocation(contract: CandidContractRecord, locationId: string): boolean {
  if (!locationId) return false;
  return (
    contract.locationId === locationId ||
    contract.physicalLocationId === locationId ||
    contract.billingLocationId === locationId
  );
}

export function patchContractDataForLocation(
  contractData: Record<string, unknown>,
  mappedLoc: string | null,
  targetCustomerId: string,
): Record<string, unknown> {
  const loc = mappedLoc ?? '';
  const existingLoc =
    (typeof contractData.locationId === 'string' && contractData.locationId) ||
    (typeof contractData.physicalLocationId === 'string' && contractData.physicalLocationId) ||
    '';
  const resolved = loc || existingLoc;
  return {
    ...contractData,
    customerId: targetCustomerId,
    locationId: resolved,
    physicalLocationId:
      loc ||
      (typeof contractData.physicalLocationId === 'string' ? contractData.physicalLocationId : '') ||
      resolved,
    billingLocationId:
      loc ||
      (typeof contractData.billingLocationId === 'string' ? contractData.billingLocationId : '') ||
      resolved,
  };
}

export function patchDocumentDataForLocation(
  documentData: Record<string, unknown>,
  mappedLoc: string | null,
  targetCustomerId: string,
): Record<string, unknown> {
  const loc = mappedLoc ?? '';
  const existing =
    typeof documentData.locationId === 'string' ? documentData.locationId : '';
  return {
    ...documentData,
    customerId: targetCustomerId,
    locationId: loc || existing,
  };
}

export function resolveMergedLocationExternalId(
  rawLoc: string | null | undefined,
  locationIdMap: Map<string, string>,
  defaultMappedLoc: string | undefined,
): string | null {
  const trimmed = rawLoc?.trim();
  if (trimmed) {
    return locationIdMap.get(trimmed) ?? trimmed;
  }
  return defaultMappedLoc ?? null;
}

export function extractLocationIdFromContractData(
  contractData: Record<string, unknown> | null | undefined,
): string | null {
  if (!contractData) return null;
  for (const key of ['locationId', 'physicalLocationId', 'billingLocationId'] as const) {
    const v = contractData[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}
