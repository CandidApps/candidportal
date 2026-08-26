import { readFileSync } from 'fs';
import { createSupabaseAdminClient } from '../src/lib/supabase/admin';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  process.env[line.slice(0, i)] = line.slice(i + 1).replace(/^"|"$/g, '');
}

const admin = createSupabaseAdminClient();
const externalId = process.argv[2] ?? 'id-v8heqrc7';

const { data: customer } = await admin
  .from('customers')
  .select('id, external_id, company')
  .eq('external_id', externalId)
  .maybeSingle();
console.log('customer', customer);

const { data: contacts } = await admin
  .from('customer_contacts')
  .select('name, email, portal_access, is_primary')
  .eq('customer_id', customer?.id ?? '')
  .limit(20);
console.log('contacts', contacts);

const { data: quotes } = await admin
  .from('quote_requests')
  .select('id, contact_email, contact_name, crm_customer_id, user_id, published_at')
  .eq('crm_customer_id', externalId);
console.log('quotes', quotes);

for (const c of contacts ?? []) {
  const { data: profile } = await admin.from('profiles').select('id, email, role').ilike('email', c.email as string).maybeSingle();
  console.log('profile for', c.email, profile);
}
