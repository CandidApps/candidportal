import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { resolvePortalCustomerForRequest } from '@/lib/portal/member-customer-resolve';
import { mapPipelineRow, type MemberQuotePipelineItem } from '@/lib/member-quote-pipeline';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const ctx = await resolvePortalCustomerForRequest({
    email: user.email,
    customerExternalId: url.searchParams.get('customerId'),
  });

  const admin = createSupabaseAdminClient();
  const email = user.email.trim().toLowerCase();
  const externalId = ctx?.customerExternalId?.trim() || '';

  const filters: string[] = [`user_id.eq.${user.id}`];
  if (externalId) filters.push(`crm_customer_external_id.eq.${externalId}`);
  if (email) filters.push(`customer_email.ilike.${email}`);

  const { data, error } = await admin
    .from('contract_submit_actions')
    .select(
      'id, quote_request_id, account_service_id, service_label, vendor_name, status, contract_storage_path, contract_url, updated_at, created_at',
    )
    .or(filters.join(','))
    .neq('status', 'converted')
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) {
    if (/contract_submit_actions/.test(error.message)) {
      return NextResponse.json({ items: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (data ?? [])
    .map((row) =>
      mapPipelineRow({
        id: String((row as { id: string }).id),
        quote_request_id: (row as { quote_request_id?: string | null }).quote_request_id,
        account_service_id: (row as { account_service_id?: string | null }).account_service_id,
        service_label: (row as { service_label?: string | null }).service_label,
        vendor_name: (row as { vendor_name?: string | null }).vendor_name,
        status: (row as { status?: string | null }).status,
        contract_storage_path: (row as { contract_storage_path?: string | null }).contract_storage_path,
        contract_url: (row as { contract_url?: string | null }).contract_url,
        updated_at: (row as { updated_at?: string | null }).updated_at,
        created_at: (row as { created_at?: string | null }).created_at,
      }),
    )
    .filter((item): item is MemberQuotePipelineItem => Boolean(item));

  return NextResponse.json({ items });
}
