import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('partner_suppliers')
    .select('*')
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as {
    name?: string;
    displayName?: string;
    supplierKey?: string | null;
    bankOrigCoName?: string | null;
    bankOrigId?: string | null;
    bankSourceAliases?: string[];
    commissionRate?: number | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    website?: string | null;
    notes?: string | null;
    providerCategory?: string | null;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('partner_suppliers')
    .insert({
      name: body.name.trim(),
      display_name: body.displayName?.trim() || body.name.trim(),
      supplier_key: body.supplierKey ?? null,
      bank_orig_co_name: body.bankOrigCoName ?? null,
      bank_orig_id: body.bankOrigId ?? null,
      bank_source_aliases: body.bankSourceAliases ?? [body.name.trim()],
      commission_rate: body.commissionRate ?? null,
      contact_name: body.contactName ?? null,
      contact_email: body.contactEmail ?? null,
      contact_phone: body.contactPhone ?? null,
      website: body.website ?? null,
      notes: body.notes ?? null,
      provider_category: body.providerCategory ?? null,
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PATCH(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as {
    id?: number;
    displayName?: string;
    bankOrigCoName?: string | null;
    bankOrigId?: string | null;
    bankSourceAliases?: string[];
    commissionRate?: number | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    website?: string | null;
    notes?: string | null;
    providerCategory?: string | null;
  };

  if (!body.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.displayName !== undefined) patch.display_name = body.displayName?.trim() || null;
  if (body.bankOrigCoName !== undefined) patch.bank_orig_co_name = body.bankOrigCoName;
  if (body.bankOrigId !== undefined) patch.bank_orig_id = body.bankOrigId;
  if (body.bankSourceAliases !== undefined) patch.bank_source_aliases = body.bankSourceAliases;
  if (body.commissionRate !== undefined) patch.commission_rate = body.commissionRate;
  if (body.contactName !== undefined) patch.contact_name = body.contactName;
  if (body.contactEmail !== undefined) patch.contact_email = body.contactEmail;
  if (body.contactPhone !== undefined) patch.contact_phone = body.contactPhone;
  if (body.website !== undefined) patch.website = body.website;
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.providerCategory !== undefined) patch.provider_category = body.providerCategory;

  const { data, error } = await admin
    .from('partner_suppliers')
    .update(patch)
    .eq('id', body.id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
