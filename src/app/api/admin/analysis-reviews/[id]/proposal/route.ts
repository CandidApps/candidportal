import { NextResponse } from 'next/server';
import path from 'path';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { mapReviewRow } from '@/lib/services/analysis-reviews';
import type { AnalysisProposalDocument } from '@/lib/bill-parse-types';

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

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: existing, error: loadErr } = await admin
    .from('bill_analysis_reviews')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const review = mapReviewRow(existing);
  const ext = path.extname(file.name).toLowerCase();
  const mimeType = file.type || MIME[ext] || 'application/octet-stream';
  const storagePath = `proposals/${review.user_id}/${id}/${safeSegment(file.name)}`;
  const now = new Date().toISOString();

  const { error: uploadErr } = await admin.storage.from(BUCKET).upload(storagePath, file, {
    upsert: true,
    contentType: mimeType,
  });
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  const proposalDocument: AnalysisProposalDocument = {
    filename: file.name,
    storagePath,
    mimeType,
    uploadedAt: now,
  };

  const draft = {
    ...(review.draft_snapshot ?? {
      category: review.detected_category,
      categoryLabel: review.category_label ?? review.detected_category,
      vendorName: review.vendor_name,
      publishedAt: now,
    }),
    proposalDocument,
  };

  const { data, error } = await admin
    .from('bill_analysis_reviews')
    .update({
      draft_snapshot: draft,
      status: review.status === 'pending_review' ? 'in_progress' : review.status,
      updated_at: now,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ review: mapReviewRow(data), proposalDocument });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: existing, error: loadErr } = await admin
    .from('bill_analysis_reviews')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const review = mapReviewRow(existing);
  const storagePath = review.draft_snapshot?.proposalDocument?.storagePath;
  if (storagePath) {
    await admin.storage.from(BUCKET).remove([storagePath]);
  }

  const draft = review.draft_snapshot ? { ...review.draft_snapshot } : null;
  if (draft) delete draft.proposalDocument;

  const { data, error } = await admin
    .from('bill_analysis_reviews')
    .update({
      draft_snapshot: draft,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ review: mapReviewRow(data) });
}
