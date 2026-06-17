import { invalidateDealIndexes, rebuildAgentRateIndex } from '@/lib/bmw/deal-master';
import { setCrmRuntimeData, type CrmRuntimeData } from '@/lib/crm/runtime-store';

import { invalidateMemberPortalContractsCache } from '@/lib/member-portal-services';

/** Apply a CRM bootstrap payload to the in-memory client store. */
export function hydrateCrmRuntime(data: Omit<CrmRuntimeData, 'ready'>): void {
  setCrmRuntimeData({
    ...data,
    ready: true,
  });
  rebuildAgentRateIndex();
  invalidateDealIndexes();
  invalidateMemberPortalContractsCache();
}
