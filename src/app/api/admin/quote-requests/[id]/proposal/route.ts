import { NextResponse } from 'next/server';
import path from 'path';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { QuoteProposalDocument } from '@/lib/quotes/types';

const BUCKET = 'service-bills';

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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
  const quoteItemId = String(form.get('quoteItemId') ?? '').trim() || undefined;
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: existing, error: loadErr } = await admin
    .from('quote_requests')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ext = path.extname(file.name).toLowerCase();
  const mimeType = file.type || MIME[ext] || 'application/octet-stream';
  const storagePath = `quote-proposals/${existing.user_id}/${id}/${quoteItemId ?? 'upload'}/${safeSegment(file.name)}`;
  const now = new Date().toISOString();

  const { error: uploadErr } = await admin.storage.from(BUCKET).upload(storagePath, file, {
    upsert: true,
    contentType: mimeType,
  });
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  const proposalDocument: QuoteProposalDocument = {
    filename: file.name,
    name: file.name,
    storagePath,
    mimeType,
    uploadedAt: now,
    url: `/api/admin/quote-requests/${id}/proposal?path=${encodeURIComponent(storagePath)}`,
  };

  return NextResponse.json({ proposalDocument });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const storagePath = new URL(request.url).searchParams.get('path');
  if (!storagePath?.startsWith('quote-proposals/')) {
    return NextResponse.json({ error: 'path required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: row } = await admin.from('quote_requests').select('user_id').eq('id', id).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!storagePath.includes(String(row.user_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await admin.storage.from(BUCKET).download(storagePath);
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 });

  const filename = storagePath.split('/').pop() ?? 'quote.pdf';
  const ext = path.extname(filename).toLowerCase();
  const mimeType = MIME[ext] ?? 'application/octet-stream';
  return new NextResponse(data, {
    headers: {
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  });
}
