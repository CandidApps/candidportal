/**
 * Diagnose baseService visibility: DB vs BMW merge for an account.
 * Usage: npx tsx scripts/diagnose-deal-service-import.ts [account_id]
 */
import { readFileSync } from 'fs';
import { loadCrmFromDatabase } from '../src/lib/crm/load-from-db';
import {
  buildAllCustomerContracts,
  mergeCustomerContractsForDisplay,
  contractDedupeKey,
} from '../src/lib/customer-contracts-from-deals';
import { baseServicesForCustomer } from '../src/components/customers/accounts-list-utils';
import { createSupabaseAdminClient } from '../src/lib/supabase/admin';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  process.env[line.slice(0, i)] = line.slice(i + 1).replace(/^"|"$/g, '');
}

const accountId = process.argv[2] ?? 'bmw-merchant-beanlab-inc';

const data = await loadCrmFromDatabase();
if (!data) throw new Error('no crm');

const fromDb = data.contractsByCustomerId[accountId] ?? [];
const fromDeals = buildAllCustomerContracts(data.customers)[accountId] ?? [];

console.log('--- DB deals', fromDb.length);
for (const c of fromDb) {
  console.log(c.id, 'dealId', c.dealId, 'base', c.baseService, 'detail', c.serviceDetail);
}

console.log('--- BMW built', fromDeals.length);
for (const c of fromDeals) {
  console.log(c.id, 'dealId', c.dealId, 'base', c.baseService, 'detail', c.serviceDetail, 'dedupe', contractDedupeKey(c));
}

const merged = mergeCustomerContractsForDisplay(
  data.contractsByCustomerId,
  buildAllCustomerContracts(data.customers),
);

console.log('--- display merge');
for (const c of merged[accountId] ?? []) {
  console.log(c.id, 'base', c.baseService, 'detail', c.serviceDetail);
}
console.log('list base column', baseServicesForCustomer(merged[accountId] ?? []));

const admin = createSupabaseAdminClient();
const { data: rows } = await admin
  .from('deals')
  .select('external_id, deal_id, contract_data')
  .eq('external_id', 'ct-bmw-checkcommerce-139260')
  .maybeSingle();
const cd = rows?.contract_data as { baseService?: string; serviceDetail?: string } | null;
console.log('--- direct db row', rows?.external_id, cd?.baseService, cd?.serviceDetail);
