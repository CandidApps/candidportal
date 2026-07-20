import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

/** Optional bill upload attached to a member New Quote draft/request. */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'File is required' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File must be 12MB or smaller' }, { status: 400 });
  }
  const type = file.type || 'application/octet-stream';
  if (!ALLOWED.has(type) && !/\.(pdf|png|jpe?g|webp)$/i.test(file.name)) {
    return NextResponse.json({ error: 'Upload a PDF or image (PNG/JPG).' }, { status: 400 });
  }

  const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(0, 120);
  const path = `quote-bills/${user.id}/${Date.now()}-${safeName}`;
  const admin = createSupabaseAdminClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage.from('service-bills').upload(path, buffer, {
    contentType: type,
    upsert: false,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    filename: file.name,
    storagePath: path,
    size: file.size,
  });
}
