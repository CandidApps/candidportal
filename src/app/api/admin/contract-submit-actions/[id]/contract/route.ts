import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createContractSignedUrl } from '@/lib/quotes/persist-supplier-contract';

export const dynamic = 'force-dynamic';

/**
 * Shareable/admin view for an imported supplier contract.
 * Redirects to a fresh signed URL (attachment) or the saved external link.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: action, error } = await admin
    .from('contract_submit_actions')
    .select('contract_url, contract_filename, contract_storage_path')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!action) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const storagePath = (action.contract_storage_path as string | null)?.trim();
  if (storagePath) {
    const signed = await createContractSignedUrl(storagePath);
    if (!signed) {
      return NextResponse.json({ error: 'Could not create share link' }, { status: 500 });
    }
    return NextResponse.redirect(signed);
  }

  const url = (action.contract_url as string | null)?.trim();
  if (url && /^https?:\/\//i.test(url)) {
    return NextResponse.redirect(url);
  }

  return NextResponse.json(
    { error: 'No contract link or file on this deal yet' },
    { status: 404 },
  );
}
