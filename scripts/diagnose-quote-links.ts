import { readFileSync } from 'fs';
import { createSupabaseAdminClient } from '../src/lib/supabase/admin';
import { resolveCrmCustomerExternalIdByContactEmail, resolveCrmCustomerExternalIdByCompany } from '../src/lib/services/quote-request-crm-link';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  process.env[line.slice(0, i)] = line.slice(i + 1).replace(/^"|"$/g, '');
}

const admin = createSupabaseAdminClient();
const { data } = await admin
  .from('quote_requests')
  .select('id, company, contact_email, crm_customer_id, user_id, published_at')
  .is('crm_customer_id', null)
  .order('created_at', { ascending: false })
  .limit(20);

for (const row of data ?? []) {
  const byEmail = await resolveCrmCustomerExternalIdByContactEmail(admin, row.contact_email as string);
  const byCompany = await resolveCrmCustomerExternalIdByCompany(admin, row.company as string);
  console.log({
    id: row.id,
    company: row.company,
    contact_email: row.contact_email,
    published: Boolean(row.published_at),
    resolveByEmail: byEmail,
    resolveByCompany: byCompany,
  });
}

// Also show published quotes with crm set vs admin user_id
const { data: published } = await admin
  .from('quote_requests')
  .select('id, company, contact_email, crm_customer_id, user_id, published_at')
  .not('published_quote_snapshot', 'is', null)
  .order('published_at', { ascending: false })
  .limit(20);

console.log('\n--- published quotes ---');
for (const row of published ?? []) {
  const { data: profile } = await admin.from('profiles').select('email, role').eq('id', row.user_id as string).maybeSingle();
  console.log({
    id: row.id,
    company: row.company,
    crm_customer_id: row.crm_customer_id,
    user_id: row.user_id,
    ownerEmail: profile?.email,
    ownerRole: profile?.role,
  });
}
