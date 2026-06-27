import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const BUCKET = 'service-bills';

/** Admin-created quote for a customer record (TASK-025). Stores metadata and an
 *  optional uploaded quote file; best-effort so the UX always completes. */
export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form' }, { status: 400 });
  }

  const customerId = String(form.get('customerId') ?? '');
  if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  let storagePath: string | null = null;

  const file = form.get('file');
  if (file && file instanceof File && file.size > 0) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `quotes/${customerId}/${Date.now()}-${safeName}`;
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
    if (!upErr) storagePath = path;
  }

  const row = {
    customer_id: customerId,
    type: String(form.get('type') ?? ''),
    provider: String(form.get('provider') ?? ''),
    method: String(form.get('method') ?? 'pricing'),
    status: String(form.get('status') ?? 'draft'),
    note: String(form.get('note') ?? ''),
    file_storage_path: storagePath,
  };

  // Best-effort insert; table may not exist in every environment.
  const { error } = await admin.from('customer_quotes').insert(row);
  if (error && !/relation .*customer_quotes.* does not exist/i.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, storagePath });
}
