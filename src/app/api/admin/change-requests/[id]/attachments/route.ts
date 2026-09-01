import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { mapChangeAttachment } from '@/lib/services/product-change-requests';

export const dynamic = 'force-dynamic';

const BUCKET = 'change-request-attachments';
const MAX_FILES = 12;
const MAX_BYTES = 25 * 1024 * 1024;

async function actorEmail(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? null;
}

async function signedUrl(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  path: string,
): Promise<string | null> {
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('product_change_attachments')
    .select('*')
    .eq('change_request_id', id)
    .order('created_at', { ascending: true });

  if (error) {
    if (/product_change_attachments|schema cache|does not exist/i.test(error.message)) {
      return NextResponse.json({ attachments: [], migrationRequired: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const attachments = await Promise.all(
    (data ?? []).map(async (row) => {
      const mapped = mapChangeAttachment(row as Record<string, unknown>);
      mapped.url = await signedUrl(admin, mapped.storage_path);
      return mapped;
    }),
  );

  return NextResponse.json({ attachments });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const email = await actorEmail();

  const { data: existing } = await admin
    .from('product_change_requests')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form' }, { status: 400 });
  }

  const files = form
    .getAll('files')
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, MAX_FILES);

  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }

  const uploaded = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `${file.name} exceeds 25MB limit` },
        { status: 400 },
      );
    }
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
    const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const { data: row, error: insErr } = await admin
      .from('product_change_attachments')
      .insert({
        change_request_id: id,
        storage_path: storagePath,
        file_name: file.name,
        content_type: file.type || 'application/octet-stream',
        byte_size: file.size,
        uploaded_by_email: email,
      })
      .select('*')
      .single();

    if (insErr) {
      await admin.storage.from(BUCKET).remove([storagePath]);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    const mapped = mapChangeAttachment(row as Record<string, unknown>);
    mapped.url = await signedUrl(admin, mapped.storage_path);
    uploaded.push(mapped);
  }

  await admin.from('product_change_events').insert({
    change_request_id: id,
    event_type: 'attachment_added',
    summary: `Added ${uploaded.length} attachment(s): ${uploaded.map((a) => a.file_name).join(', ')}`,
    actor_email: email,
  });

  return NextResponse.json({ attachments: uploaded });
}
