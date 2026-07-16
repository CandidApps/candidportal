import { NextResponse } from 'next/server';
import path from 'path';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { CUSTOMER_MESSAGE_ATTACHMENT_BUCKET } from '@/lib/customer-message-attachments';

export const dynamic = 'force-dynamic';

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.zip': 'application/zip',
};

/** Signed download for customer-message attachments (admin or owning member). */
export async function GET(request: Request) {
  const storagePath = new URL(request.url).searchParams.get('path')?.trim() ?? '';
  if (!storagePath || storagePath.includes('..') || !storagePath.startsWith('messages/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const role = await getMyRole();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (role !== 'admin') {
    const ownerPrefix = `messages/${user.id}/`;
    if (!storagePath.startsWith(ownerPrefix)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const admin = createSupabaseAdminClient();
  const { data: file, error } = await admin.storage
    .from(CUSTOMER_MESSAGE_ATTACHMENT_BUCKET)
    .download(storagePath);
  if (error || !file) {
    return NextResponse.json({ error: error?.message ?? 'Download failed' }, { status: 404 });
  }

  const filename = path.basename(storagePath);
  const ext = path.extname(filename).toLowerCase();
  const mimeType = MIME[ext] || 'application/octet-stream';
  const buffer = Buffer.from(await file.arrayBuffer());

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
