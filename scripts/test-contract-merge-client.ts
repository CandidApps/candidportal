import { readFileSync } from 'fs';
import { loadCrmFromDatabase } from '../src/lib/crm/load-from-db';
import { loadBmwDealsFromDatabase } from '../src/lib/crm/load-bmw-from-db';
import {
  buildContractsFromDeals,
  mergeCustomerContractsForDisplay,
} from '../src/lib/customer-contracts-from-deals';
import { baseServicesForCustomer } from '../src/components/customers/accounts-list-utils';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  process.env[line.slice(0, i)] = line.slice(i + 1).replace(/^"|"$/g, '');
}

const data = await loadCrmFromDatabase();
if (!data) throw new Error('no crm');
const bmwDeals = await loadBmwDealsFromDatabase();
const fromDeals = buildContractsFromDeals(data.customers, bmwDeals);
const merged = mergeCustomerContractsForDisplay(data.contractsByCustomerId, fromDeals);

let withBase = 0;
let withoutBase = 0;
for (const [id, contracts] of Object.entries(merged)) {
  const bases = baseServicesForCustomer(contracts);
  if (bases.length) withBase += 1;
  else if (contracts.some((c) => c.dealStatus === 'active')) withoutBase += 1;
}
console.log('accounts with base service column', withBase, 'active without base', withoutBase);

const bean = merged['bmw-merchant-beanlab-inc'] ?? [];
console.log('beanlab bases', baseServicesForCustomer(bean));
