import { readFileSync } from 'fs';
import { createSupabaseAdminClient } from '../src/lib/supabase/admin';
import {
  repairAllOrphanQuoteRequestLinks,
  repairMisassignedQuoteRequestOwners,
  repairQuoteRequestLinksForCustomer,
} from '../src/lib/services/quote-request-crm-link';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  process.env[line.slice(0, i)] = line.slice(i + 1).replace(/^"|"$/g, '');
}

const customerId = process.argv[2]?.trim();
const admin = createSupabaseAdminClient();

if (customerId) {
  const result = await repairQuoteRequestLinksForCustomer(admin, customerId);
  console.log(`Repaired quotes for account ${customerId}:`, result);
} else {
  const orphan = await repairAllOrphanQuoteRequestLinks(admin);
  const owners = await repairMisassignedQuoteRequestOwners(admin);
  console.log('Repaired all orphan quotes:', orphan);
  console.log('Reassigned admin-owned quotes:', owners);
}
