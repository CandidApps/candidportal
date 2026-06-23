import { NextResponse } from 'next/server';
import path from 'path';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { mapReviewRow } from '@/lib/services/analysis-reviews';

const BUCKET = 'service-bills';

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

async function canAccessReview(reviewId: string): Promise<{ ok: true; storagePath: string; filename: string; mimeType: string } | { ok: false; status: number; error: string }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('bill_analysis_reviews')
    .select('*')
    .eq('id', reviewId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message };
  if (!data) return { ok: false, status: 404, error: 'Not found' };

  const review = mapReviewRow(data);
  const role = await getMyRole();
  if (role === 'admin') {
    // allow admin
  } else {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.id !== review.user_id) {
      return { ok: false, status: 401, error: 'Unauthorized' };
    }
    if (review.status !== 'published') {
      return { ok: false, status: 403, error: 'Proposal not published' };
    }
  }

  const doc =
    review.published_snapshot?.proposalDocument ??
    review.draft_snapshot?.proposalDocument;
  if (!doc?.storagePath) {
    return { ok: false, status: 404, error: 'No proposal document' };
  }

  const ext = path.extname(doc.filename).toLowerCase();
  return {
    ok: true,
    storagePath: doc.storagePath,
    filename: doc.filename,
    mimeType: doc.mimeType || MIME[ext] || 'application/octet-stream',
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await canAccessReview(id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(access.storagePath);
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Download failed' }, { status: 500 });
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': access.mimeType,
      'Content-Disposition': `inline; filename="${access.filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
