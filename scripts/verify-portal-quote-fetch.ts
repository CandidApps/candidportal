import { readFileSync } from 'fs';
import { createSupabaseAdminClient } from '../src/lib/supabase/admin';
import { fetchQuoteRequestsForPortalCustomer } from '../src/lib/services/quote-request-crm-link';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  process.env[line.slice(0, i)] = line.slice(i + 1).replace(/^"|"$/g, '');
}

const admin = createSupabaseAdminClient();
const customerId = process.argv[2] ?? 'id-v8heqrc7';

const all = await fetchQuoteRequestsForPortalCustomer(admin, customerId, { scope: 'all' });
const published = await fetchQuoteRequestsForPortalCustomer(admin, customerId, { scope: 'published' });

console.log(`Portal fetch for ${customerId}:`);
console.log('all quotes', all.length);
console.log('published quotes', published.length);
console.log(
  'published ids',
  published.map((q) => q.id),
);
