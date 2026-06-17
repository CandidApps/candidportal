/**
 * Hydrates the in-memory CRM runtime from local JSON seed files.
 * Used only by one-time import scripts on a machine with source data.
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { invalidateDealIndexes, rebuildAgentRateIndex } from '../../src/lib/bmw/deal-master.ts';
import { setCrmRuntimeData } from '../../src/lib/crm/runtime-store.ts';
import type { BmwAgentRate, BmwDeal } from '../../src/lib/bmw/types.ts';
import type { CustomerDocument } from '../../src/lib/customer-records.ts';
import {
  clearImportMerchants,
  registerImportMerchants,
  type ImportMerchant,
} from '../../src/lib/portal-import/merge.ts';

type PortalIndex = {
  merchants?: Record<string, ImportMerchant>;
  documentsByCustomerId?: Record<string, CustomerDocument[]>;
};

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** Load BMW + portal-import JSON into the runtime store before buildCrmSnapshot(). */
export function hydrateLocalSeedFromDisk(root = process.cwd()): void {
  const deals = readJson<BmwDeal[]>(resolve(root, 'src/data/bmw/deals.json'), []);
  const agentRates = readJson<BmwAgentRate[]>(resolve(root, 'src/data/bmw/agent-rates.json'), []);
  const portal = readJson<PortalIndex | null>(resolve(root, 'src/data/portal-import/index.json'), null);

  clearImportMerchants();
  if (portal?.merchants) {
    registerImportMerchants(portal.merchants);
  }

  const documentsByCustomerId: Record<string, CustomerDocument[]> = {};
  for (const [customerId, docs] of Object.entries(portal?.documentsByCustomerId ?? {})) {
    documentsByCustomerId[customerId] = docs.map((doc) => ({
      ...doc,
      customerId: doc.customerId || customerId,
    }));
  }

  setCrmRuntimeData({
    customers: [],
    documentsByCustomerId,
    contractsByCustomerId: {},
    bmwDeals: deals,
    agentRates,
    source: 'empty',
    ready: deals.length > 0 || Boolean(portal?.merchants),
  });

  rebuildAgentRateIndex();
  invalidateDealIndexes();
}
