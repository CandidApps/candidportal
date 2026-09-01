import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const BUCKET = 'change-request-attachments';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, attachmentId } = await params;
  const admin = createSupabaseAdminClient();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: row, error } = await admin
    .from('product_change_attachments')
    .select('*')
    .eq('id', attachmentId)
    .eq('change_request_id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const path = String((row as { storage_path: string }).storage_path);
  await admin.storage.from(BUCKET).remove([path]);
  const { error: delErr } = await admin
    .from('product_change_attachments')
    .delete()
    .eq('id', attachmentId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  await admin.from('product_change_events').insert({
    change_request_id: id,
    event_type: 'attachment_removed',
    summary: `Removed attachment: ${String((row as { file_name?: string }).file_name ?? path)}`,
    actor_email: user?.email ?? null,
  });

  return NextResponse.json({ ok: true });
}
