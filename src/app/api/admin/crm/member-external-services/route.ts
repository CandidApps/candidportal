import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getCrmCustomerUuid } from '@/lib/crm/load-from-db';

import type { MemberExternalServiceAsset } from '@/lib/crm/member-external-services';

export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const customerId = new URL(request.url).searchParams.get('customerId')?.trim();
  if (!customerId) {
    return NextResponse.json({ error: 'customerId required' }, { status: 400 });
  }

  const customerUuid = await getCrmCustomerUuid(customerId);
  if (!customerUuid) {
    return NextResponse.json({ services: [] });
  }

  const admin = createSupabaseAdminClient();

  const { data: contacts } = await admin
    .from('customer_contacts')
    .select('email')
    .eq('customer_id', customerUuid);

  const emails = [
    ...new Set(
      (contacts ?? [])
        .map((c) => c.email?.trim().toLowerCase())
        .filter((e): e is string => Boolean(e)),
    ),
  ];

  if (!emails.length) {
    return NextResponse.json({ services: [] });
  }

  const { data: profiles } = await admin.from('profiles').select('id, email').in('email', emails);

  const profileIds = (profiles ?? []).map((p) => p.id as string);
  const emailByUserId = new Map(
    (profiles ?? []).map((p) => [p.id as string, p.email as string | null]),
  );

  if (!profileIds.length) {
    return NextResponse.json({ services: [] });
  }

  const { data: byUser, error: userErr } = await admin
    .from('account_services')
    .select(
      'id, name, vendor, status, monthly_amount_cents, bill_storage_path, contract_storage_path, contract_filename, service_description, expires_at, user_id, created_at',
    )
    .in('user_id', profileIds)
    .eq('candid_managed', false);

  if (userErr) {
    if (userErr.message.includes('crm_customer_id')) {
      /* column may not exist yet — continue with user match only */
    } else {
      return NextResponse.json({ error: userErr.message }, { status: 500 });
    }
  }

  const { data: byCustomer } = await admin
    .from('account_services')
    .select(
      'id, name, vendor, status, monthly_amount_cents, bill_storage_path, contract_storage_path, contract_filename, service_description, expires_at, user_id, created_at',
    )
    .eq('crm_customer_id', customerId)
    .eq('candid_managed', false);

  const merged = new Map<string, MemberExternalServiceAsset>();
  for (const row of [...(byUser ?? []), ...(byCustomer ?? [])]) {
    const id = row.id as string;
    if (merged.has(id)) continue;
    merged.set(id, {
      id,
      name: row.name as string,
      vendor: (row.vendor as string | null) ?? null,
      status: row.status as string,
      monthlyAmountCents: (row.monthly_amount_cents as number | null) ?? null,
      billStoragePath: (row.bill_storage_path as string | null) ?? null,
      contractStoragePath: (row.contract_storage_path as string | null) ?? null,
      contractFilename: (row.contract_filename as string | null) ?? null,
      serviceDescription: (row.service_description as string | null) ?? null,
      expiresAt: (row.expires_at as string | null) ?? null,
      memberEmail: emailByUserId.get(row.user_id as string) ?? null,
      createdAt: row.created_at as string,
    });
  }

  const services = [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ services });
}
