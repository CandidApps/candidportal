import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export type PortalContactType = 'account' | 'supplier' | 'team';

export type PortalContact = {
  name: string;
  email: string;
  /** Company / organization the contact belongs to, when known. */
  org: string | null;
  type: PortalContactType;
};

const LIMIT = 40;
const DIRECTORY_LIMIT = 2500;

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/**
 * Unified contact directory for email autocomplete in MyAssistant.
 * Aggregates CRM account contacts, partner-supplier contacts, and Candid team
 * members. Filtered server-side by a free-text query against name/email/org.
 */
export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const q = (params.get('q') ?? '').trim().toLowerCase();
  const all = params.get('all') === '1';
  const admin = createSupabaseAdminClient();

  const [contactsRes, suppliersRes, teamRes] = await Promise.all([
    admin
      .from('customer_contacts')
      .select('name, email, role, customer_id, customers(company)')
      .neq('email', '')
      .limit(500),
    admin
      .from('partner_suppliers')
      .select('display_name, name, contact_name, contact_email')
      .not('contact_email', 'is', null)
      .limit(500),
    admin.from('profiles').select('display_name, email, role').not('email', 'is', null).limit(500),
  ]);

  const out: PortalContact[] = [];
  const seen = new Set<string>();

  const push = (name: string, email: string, org: string | null, type: PortalContactType) => {
    const addr = (email ?? '').trim();
    if (!isEmail(addr)) return;
    const key = addr.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: (name ?? '').trim() || addr, email: addr, org: org?.trim() || null, type });
  };

  for (const row of contactsRes.data ?? []) {
    const company =
      (row as { customers?: { company?: string } | { company?: string }[] }).customers;
    const org = Array.isArray(company) ? company[0]?.company : company?.company;
    push(String(row.name ?? ''), String(row.email ?? ''), org ?? null, 'account');
  }

  for (const row of suppliersRes.data ?? []) {
    const org = String(row.display_name ?? row.name ?? '') || null;
    push(String(row.contact_name ?? ''), String(row.contact_email ?? ''), org, 'supplier');
  }

  for (const row of teamRes.data ?? []) {
    push(String(row.display_name ?? ''), String(row.email ?? ''), 'Candid', 'team');
  }

  const filtered = q
    ? out.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          (c.org ?? '').toLowerCase().includes(q),
      )
    : out;

  // Stable, useful ordering: starts-with matches first, then alpha by name.
  filtered.sort((a, b) => {
    if (q) {
      const aStarts = a.name.toLowerCase().startsWith(q) || a.email.toLowerCase().startsWith(q);
      const bStarts = b.name.toLowerCase().startsWith(q) || b.email.toLowerCase().startsWith(q);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  const cap = all ? DIRECTORY_LIMIT : LIMIT;
  return NextResponse.json({ contacts: filtered.slice(0, cap) });
}
