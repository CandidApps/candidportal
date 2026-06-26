import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export type ContactDetailType = 'account' | 'supplier' | 'team';

export type ContactDetail = {
  found: boolean;
  type: ContactDetailType | null;
  name: string;
  email: string;
  phone: string | null;
  role: string | null;
  org: string | null;
  /** CRM customer id when the contact maps to an account (for "open account"). */
  customerId: string | null;
  website: string | null;
  category: string | null;
  agent: string | null;
  status: string | null;
};

function empty(email: string): ContactDetail {
  return {
    found: false,
    type: null,
    name: email,
    email,
    phone: null,
    role: null,
    org: null,
    customerId: null,
    website: null,
    category: null,
    agent: null,
    status: null,
  };
}

/**
 * Resolves a single email address to the richest portal record we have:
 * CRM account contact > partner supplier > Candid team member. Used by the
 * MyAssistant "Email to handle" contact modal.
 */
export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = (new URL(request.url).searchParams.get('email') ?? '').trim().toLowerCase();
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });

  const admin = createSupabaseAdminClient();

  // 1) CRM account contact (highest priority).
  const { data: contactRows } = await admin
    .from('customer_contacts')
    .select('name, email, phone, role, customer_id, customers(company, agent, status)')
    .ilike('email', email)
    .limit(1);
  const contact = contactRows?.[0];
  if (contact) {
    const company = (contact as { customers?: { company?: string; agent?: string; status?: string } | { company?: string; agent?: string; status?: string }[] }).customers;
    const c = Array.isArray(company) ? company[0] : company;
    return NextResponse.json({
      detail: {
        found: true,
        type: 'account',
        name: String(contact.name ?? '') || email,
        email,
        phone: (contact.phone as string | null)?.trim() || null,
        role: (contact.role as string | null)?.trim() || null,
        org: c?.company?.trim() || null,
        customerId: contact.customer_id ? String(contact.customer_id) : null,
        website: null,
        category: null,
        agent: c?.agent?.trim() || null,
        status: c?.status?.trim() || null,
      } satisfies ContactDetail,
    });
  }

  // 2) Partner supplier contact.
  const { data: supplierRows } = await admin
    .from('partner_suppliers')
    .select('display_name, name, contact_name, contact_email, contact_phone, website, provider_category')
    .ilike('contact_email', email)
    .limit(1);
  const supplier = supplierRows?.[0];
  if (supplier) {
    return NextResponse.json({
      detail: {
        found: true,
        type: 'supplier',
        name: String(supplier.contact_name ?? '') || email,
        email,
        phone: (supplier.contact_phone as string | null)?.trim() || null,
        role: null,
        org: String(supplier.display_name ?? supplier.name ?? '').trim() || null,
        customerId: null,
        website: (supplier.website as string | null)?.trim() || null,
        category: (supplier.provider_category as string | null)?.trim() || null,
        agent: null,
        status: null,
      } satisfies ContactDetail,
    });
  }

  // 3) Candid team member.
  const { data: teamRows } = await admin
    .from('profiles')
    .select('display_name, email, role')
    .ilike('email', email)
    .limit(1);
  const team = teamRows?.[0];
  if (team) {
    return NextResponse.json({
      detail: {
        found: true,
        type: 'team',
        name: String(team.display_name ?? '') || email,
        email,
        phone: null,
        role: (team.role as string | null)?.trim() || null,
        org: 'Candid',
        customerId: null,
        website: null,
        category: null,
        agent: null,
        status: null,
      } satisfies ContactDetail,
    });
  }

  return NextResponse.json({ detail: empty(email) });
}
