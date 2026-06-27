import { NextResponse } from 'next/server';
import { upsertCustomerContact } from '@/lib/crm/persist';
import { resolveMemberPortalCustomer } from '@/lib/portal/member-customer-resolve';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { Contact } from '@/components/CustomersView';

function newContactId(): string {
  return `co-member-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ctx = await resolveMemberPortalCustomer(user.email);
  if (!ctx) {
    return NextResponse.json({ contacts: [], customerId: null, companyName: null });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('customer_contacts')
    .select('*')
    .eq('customer_id', ctx.customerUuid)
    .order('is_primary', { ascending: false })
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const contacts: Contact[] = (data ?? []).map((c) => ({
    id: c.external_id as string,
    name: c.name as string,
    role: c.role as string,
    email: c.email as string,
    phone: c.phone as string,
    isPrimary: Boolean(c.is_primary),
    locationIds: (c.location_ids as string[]) ?? [],
    crmNotes: (c.crm_notes as string | null) ?? undefined,
    portalAccess: Boolean(c.portal_access),
    portalAccessTier: (c.portal_access_tier as Contact['portalAccessTier']) ?? undefined,
    portalInviteSentAt: (c.portal_invite_sent_at as string | null) ?? undefined,
  }));
  return NextResponse.json({
    customerId: ctx.customerExternalId,
    companyName: ctx.companyName,
    contacts,
    canInvite: true,
  });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ctx = await resolveMemberPortalCustomer(user.email);
  if (!ctx) {
    return NextResponse.json(
      { error: 'Your account is not linked to a company profile. Contact Candid support.' },
      { status: 403 },
    );
  }

  const body = (await request.json()) as {
    name?: string;
    email?: string;
    role?: string;
    phone?: string;
    grantPortalAccess?: boolean;
  };

  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  if (!name || !email) {
    return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  const contact: Contact = {
    id: newContactId(),
    name,
    email,
    role: body.role?.trim() || 'Team member',
    phone: body.phone?.trim() || '',
    isPrimary: false,
    portalAccess: body.grantPortalAccess ?? false,
    portalAccessTier: 'full',
    locationIds: ctx.isPrimaryContact ? [] : ctx.locationIds,
    crmNotes: `Invited by ${ctx.contactName} via member portal`,
  };

  try {
    await upsertCustomerContact(ctx.customerExternalId, contact);
  } catch (err) {
    // Surface the real reason instead of an unhandled 500 / generic client error.
    const message = err instanceof Error ? err.message : 'Could not add team member.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, contact });
}
