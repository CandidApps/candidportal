import { readFileSync } from 'fs';
import { loadCrmFromDatabase } from '../src/lib/crm/load-from-db';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  process.env[line.slice(0, i)] = line.slice(i + 1).replace(/^"|"$/g, '');
}

const data = await loadCrmFromDatabase();
console.log('customers', data?.customers?.length);
console.log('bmwDeals', data?.bmwDeals?.length);
console.log('agentRates', data?.agentRates?.length);
