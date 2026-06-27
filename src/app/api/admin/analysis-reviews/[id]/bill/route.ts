import { NextResponse } from 'next/server';
import path from 'path';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { mapReviewRow } from '@/lib/services/analysis-reviews';

const BUCKET = 'service-bills';

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from('bill_analysis_reviews').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const review = mapReviewRow(data);
  const storagePath = review.bill_storage_path;
  if (!storagePath || storagePath.startsWith('local://')) {
    return NextResponse.json({ error: 'No bill document' }, { status: 404 });
  }

  const { data: file, error: dlErr } = await admin.storage.from(BUCKET).download(storagePath);
  if (dlErr || !file) {
    return NextResponse.json({ error: dlErr?.message ?? 'Download failed' }, { status: 500 });
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
